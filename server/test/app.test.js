import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db, pool } from '../src/db.js'
const url = new URL(process.env.DATABASE_URL)
if (
  process.env.NODE_ENV !== 'test' ||
  url.pathname !== '/odin_messaging_app_test' ||
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.searchParams.get('host') !== '/var/run/postgresql'
)
  throw new Error('Refusing cleanup outside the isolated local test database')
let app, alice, bob, eve, conversation, firstMessage
const people = []
function client() {
  const agent = request.agent(app)
  let csrf
  return {
    agent,
    async init() {
      csrf = (await agent.get('/api/session')).body.csrfToken
    },
    async mutate(path, body, method = 'post') {
      const result = await agent[method](`/api${path}`)
        .set('Origin', process.env.APP_ORIGIN)
        .set('X-CSRF-Token', csrf)
        .send(body)
      if (result.body.csrfToken) csrf = result.body.csrfToken
      return result
    },
  }
}
before(async () => {
  await db.message.deleteMany()
  await db.conversation.deleteMany()
  await db.user.deleteMany()
  await pool.query('DELETE FROM session')
  app = createApp()
  for (const username of ['alice', 'bobby', 'evelyn']) {
    const person = client()
    await person.init()
    const result = await person.mutate('/signup', {
      username,
      displayName: username,
      password: 'fictional-password',
      passwordConfirmation: 'fictional-password',
    })
    assert.equal(result.status, 201)
    person.user = result.body.user
    people.push(person)
  }
  ;[alice, bob, eve] = people
})
after(async () => {
  await db.$disconnect()
  await pool.end()
})
test('validates signup, confirmation, normalized duplicates and byte limit', async () => {
  const person = client()
  await person.init()
  const valid = {
    username: 'ALICE',
    displayName: 'Alice',
    password: 'long-password',
    passwordConfirmation: 'long-password',
  }
  assert.equal((await person.mutate('/signup', valid)).status, 409)
  for (const invalid of [
    { username: 'a!' },
    { displayName: '' },
    { passwordConfirmation: 'different' },
    { password: '💌'.repeat(19), passwordConfirmation: '💌'.repeat(19) },
    { role: 'admin' },
  ])
    assert.equal(
      (await person.mutate('/signup', { ...valid, ...invalid })).status,
      400,
    )
})
test('requires authentication and rejects invalid cookies', async () => {
  assert.equal((await request(app).get('/api/conversations')).status, 401)
  assert.equal(
    (
      await request(app)
        .get('/api/conversations')
        .set('Cookie', 'signal.sid=invalid')
    ).status,
    401,
  )
  const invalid = client()
  await invalid.init()
  assert.equal(
    (await invalid.mutate('/login', { username: 'alice', password: 'wrong' }))
      .status,
    401,
  )
  assert.equal(
    (
      await invalid.mutate('/login', {
        username: 'nonexistent',
        password: 'wrong',
      })
    ).body.error,
    'Invalid username or password.',
  )
})
test('rotates session at login, persists across app instances, and destroys logout', async () => {
  const person = client()
  const initial = await person.agent.get('/api/session')
  await person.init()
  const login = await person.mutate('/login', {
    username: ' ALICE ',
    password: 'fictional-password',
  })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.passwordHash, undefined)
  const cookie = login.headers['set-cookie'][0]
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.doesNotMatch(cookie, /Secure/)
  assert.notEqual(
    cookie.split(';')[0],
    initial.headers['set-cookie'][0].split(';')[0],
  )
  assert.equal(
    (
      await request(createApp())
        .get('/api/conversations')
        .set('Cookie', cookie.split(';')[0])
    ).status,
    200,
  )
  assert.equal((await person.mutate('/logout')).status, 204)
  assert.equal(
    (
      await request(app)
        .get('/api/conversations')
        .set('Cookie', cookie.split(';')[0])
    ).status,
    401,
  )
})
test('CSRF requires matching session token and exact trusted origin', async () => {
  assert.equal(
    (
      await alice.agent
        .patch('/api/profile')
        .send({ displayName: 'No', bio: '' })
    ).status,
    403,
  )
  const token = (await alice.agent.get('/api/session')).body.csrfToken
  assert.equal(
    (
      await alice.agent
        .patch('/api/profile')
        .set('X-CSRF-Token', token)
        .set('Origin', 'https://evil.example')
        .send({ displayName: 'No', bio: '' })
    ).status,
    403,
  )
})
test('updates only public profile fields, bounds search, excludes self', async () => {
  assert.equal(
    (
      await alice.mutate(
        '/profile',
        { displayName: 'Alice Finch', bio: 'A fictional person.' },
        'patch',
      )
    ).status,
    200,
  )
  for (const key of ['id', 'password', 'username', 'role'])
    assert.equal(
      (
        await alice.mutate(
          '/profile',
          { displayName: 'Alice', bio: '', [key]: 'bad' },
          'patch',
        )
      ).status,
      400,
    )
  const results = await alice.agent.get('/api/users?q=ali')
  assert.deepEqual(results.body.users, [])
  const found = await alice.agent.get('/api/users?q=bob')
  assert.equal(found.body.users[0].id, bob.user.id)
  assert.equal(found.body.users[0].passwordHash, undefined)
  assert.equal((await alice.agent.get('/api/users?q=')).status, 400)
})
test('prevents self conversations and concurrently reuses participant pair', async () => {
  assert.equal(
    (await alice.mutate('/conversations', { userId: alice.user.id })).status,
    400,
  )
  const responses = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      (i % 2 ? alice : bob).mutate('/conversations', {
        userId: i % 2 ? bob.user.id : alice.user.id,
      }),
    ),
  )
  responses.forEach((result) => assert.equal(result.status, 200))
  assert.equal(new Set(responses.map((result) => result.body.id)).size, 1)
  conversation = responses[0].body.id
})
test('participants send text; rejects spoofing and invalid messages', async () => {
  const path = `/conversations/${conversation}/messages`
  for (const body of [
    { text: ' ' },
    { text: 'a'.repeat(4001) },
    { text: 'hello', senderId: bob.user.id },
  ])
    assert.equal((await alice.mutate(path, body)).status, 400)
  const result = await alice.mutate(path, {
    text: '<script>alert(1)</script>\nHello Bob',
  })
  assert.equal(result.status, 201)
  assert.equal(result.body.message.senderId, alice.user.id)
  firstMessage = result.body.message.id
  assert.equal(
    (await bob.agent.get(`/api${path}`)).body.messages[0].text,
    '<script>alert(1)</script>\nHello Bob',
  )
})
test('private identifiers do not disclose conversations or message cursors', async () => {
  const path = `/conversations/${conversation}/messages`
  assert.equal((await eve.agent.get(`/api${path}`)).status, 404)
  assert.equal((await eve.mutate(path, { text: 'intrusion' })).status, 404)
  assert.equal(
    (await eve.agent.get(`/api${path}?before=${firstMessage}`)).status,
    404,
  )
  assert.equal(
    (await eve.agent.get('/api/conversations')).body.conversations.length,
    0,
  )
  assert.equal(
    (await eve.agent.get('/api/conversations/999999/messages')).status,
    404,
  )
})
test('stable bounded pagination handles equal timestamps without duplicates', async () => {
  const createdAt = new Date('2026-01-01T12:00:00Z')
  await db.message.createMany({
    data: Array.from({ length: 65 }, (_, i) => ({
      conversationId: conversation,
      senderId: bob.user.id,
      text: `Message ${i}`,
      createdAt,
    })),
  })
  const path = `/api/conversations/${conversation}/messages`
  const recent = (await alice.agent.get(path)).body
  assert.equal(recent.messages.length, 30)
  assert.equal(recent.hasOlder, true)
  const older = (
    await alice.agent.get(`${path}?before=${recent.messages[0].id}`)
  ).body
  assert.equal(older.messages.length, 30)
  assert.ok(older.messages.at(-1).id < recent.messages[0].id)
  const oldest = (
    await alice.agent.get(`${path}?before=${older.messages[0].id}`)
  ).body
  assert.equal(oldest.messages.length, 6)
  assert.equal(oldest.hasOlder, false)
  const otherConversation = (
    await eve.mutate('/conversations', { userId: bob.user.id })
  ).body.id
  assert.equal(
    (
      await eve.agent.get(
        `/api/conversations/${otherConversation}/messages?before=${firstMessage}`,
      )
    ).status,
    404,
  )
  assert.equal(
    (await alice.agent.get('/api/conversations/nope/messages')).status,
    400,
  )
})
test('expired database sessions are rejected', async () => {
  const person = client()
  await person.init()
  const login = await person.mutate('/login', {
    username: 'bobby',
    password: 'fictional-password',
  })
  const cookie = login.headers['set-cookie'][0].split(';')[0]
  const sid = decodeURIComponent(cookie.split('=')[1]).slice(2).split('.')[0]
  await pool.query(
    "UPDATE session SET expire = now() - interval '1 day' WHERE sid = $1",
    [sid],
  )
  assert.equal(
    (await request(app).get('/api/conversations').set('Cookie', cookie)).status,
    401,
  )
})
