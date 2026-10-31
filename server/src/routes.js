import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import bcrypt from 'bcrypt'
import { db, publicUser } from './db.js'
import { requireUser, token, cookieName } from './security.js'
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status })
function fields(body, allowed) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw fail('Unexpected request fields.')
}
function text(value, min, max, label) {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw fail(`${label} must be ${min}–${max} characters.`)
  return value.trim()
}
function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    throw fail('Invalid identifier.')
  return Number(value)
}
async function participant(req) {
  const conversation = await db.conversation.findFirst({
    where: {
      id: id(req.params.id),
      OR: [{ firstId: req.user.id }, { secondId: req.user.id }],
    },
  })
  if (!conversation) throw fail('Conversation not found.', 404)
  return conversation
}
export function routes(passport) {
  const router = Router()
  const limited = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
  })
  router.get('/session', (req, res) =>
    res.json({ user: req.user || null, csrfToken: token(req) }),
  )
  router.post('/signup', limited, async (req, res) => {
    fields(req.body, [
      'username',
      'displayName',
      'password',
      'passwordConfirmation',
    ])
    const username = text(req.body.username, 3, 24, 'Username').toLowerCase()
    if (!/^[a-z0-9_]+$/.test(username))
      throw fail('Use letters, numbers, and underscores in your username.')
    const displayName = text(req.body.displayName, 1, 50, 'Display name')
    const password = req.body.password
    if (
      typeof password !== 'string' ||
      password.length < 10 ||
      Buffer.byteLength(password) > 72
    )
      throw fail(
        'Password must have at least 10 characters and at most 72 UTF-8 bytes.',
      )
    if (password !== req.body.passwordConfirmation)
      throw fail('Passwords do not match.')
    try {
      const user = await db.user.create({
        data: {
          username,
          displayName,
          passwordHash: await bcrypt.hash(password, 12),
        },
        select: publicUser,
      })
      await new Promise((resolve, reject) =>
        req.login(user, (error) => (error ? reject(error) : resolve())),
      )
      res.status(201).json({ user, csrfToken: token(req) })
    } catch (error) {
      if (error.code === 'P2002') throw fail('Username is already taken.', 409)
      throw error
    }
  })
  router.post('/login', limited, (req, res, next) => {
    try {
      fields(req.body, ['username', 'password'])
      text(req.body.username, 1, 100, 'Username')
      if (
        typeof req.body.password !== 'string' ||
        Buffer.byteLength(req.body.password) > 72
      )
        throw fail('Invalid username or password.', 401)
    } catch (error) {
      return next(error)
    }
    passport.authenticate('local', (error, user) => {
      if (error) return next(error)
      if (!user)
        return res.status(401).json({ error: 'Invalid username or password.' })
      req.login(user, (error) => {
        if (error) return next(error)
        res.json({
          user: Object.fromEntries(
            Object.keys(publicUser).map((key) => [key, user[key]]),
          ),
          csrfToken: token(req),
        })
      })
    })(req, res, next)
  })
  router.use(requireUser)
  router.post('/logout', (req, res, next) =>
    req.session.destroy((error) => {
      if (error) return next(error)
      res.clearCookie(cookieName(), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
      res.status(204).end()
    }),
  )
  router.patch('/profile', async (req, res) => {
    fields(req.body, ['displayName', 'bio'])
    const user = await db.user.update({
      where: { id: req.user.id },
      data: {
        displayName: text(req.body.displayName, 1, 50, 'Display name'),
        bio: text(req.body.bio, 0, 160, 'Bio'),
      },
      select: publicUser,
    })
    res.json({ user })
  })
  router.get('/users', async (req, res) => {
    const query = text(req.query.q, 1, 24, 'Search')
    res.json({
      users: await db.user.findMany({
        where: {
          id: { not: req.user.id },
          username: { contains: query.toLowerCase() },
        },
        select: publicUser,
        take: 12,
        orderBy: [{ username: 'asc' }, { id: 'asc' }],
      }),
    })
  })
  router.get('/conversations', async (req, res) => {
    const rows = await db.conversation.findMany({
      where: { OR: [{ firstId: req.user.id }, { secondId: req.user.id }] },
      include: {
        first: { select: publicUser },
        second: { select: publicUser },
        messages: { take: 1, orderBy: { id: 'desc' } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    })
    res.json({
      conversations: rows.map((row) => ({
        id: row.id,
        other: row.firstId === req.user.id ? row.second : row.first,
        latest: row.messages[0] || null,
      })),
    })
  })
  router.post('/conversations', async (req, res) => {
    fields(req.body, ['userId'])
    const otherId = id(req.body.userId)
    if (otherId === req.user.id) throw fail('Choose another person.')
    if (
      !(await db.user.findUnique({
        where: { id: otherId },
        select: { id: true },
      }))
    )
      throw fail('User not found.', 404)
    const [firstId, secondId] = [req.user.id, otherId].sort((a, b) => a - b)
    const pair = { firstId_secondId: { firstId, secondId } }
    let conversation
    try {
      conversation = await db.conversation.upsert({
        where: pair,
        create: { firstId, secondId },
        update: {},
      })
    } catch (error) {
      // Prisma may emulate an empty-update upsert. The unique index wins a race;
      // the losing request returns that same conversation instead of failing.
      if (error.code !== 'P2002') throw error
      conversation = await db.conversation.findUniqueOrThrow({ where: pair })
    }
    res.json({ id: conversation.id })
  })
  router.get('/conversations/:id/messages', async (req, res) => {
    const conversation = await participant(req)
    const before =
      req.query.before === undefined ? undefined : id(req.query.before)
    if (
      before &&
      !(await db.message.findFirst({
        where: { id: before, conversationId: conversation.id },
        select: { id: true },
      }))
    )
      throw fail('Message cursor not found.', 404)
    const rows = await db.message.findMany({
      where: {
        conversationId: conversation.id,
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 31,
    })
    res.json({
      messages: rows.slice(0, 30).reverse(),
      hasOlder: rows.length > 30,
    })
  })
  router.post('/conversations/:id/messages', async (req, res) => {
    const conversation = await participant(req)
    fields(req.body, ['text'])
    const content = text(req.body.text, 1, 4000, 'Message')
    const message = await db.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: req.user.id,
          text: content,
        },
      })
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      })
      return message
    })
    res.status(201).json({ message })
  })
  return router
}
