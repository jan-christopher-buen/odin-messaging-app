import bcrypt from 'bcrypt'
import { db, pool } from '../src/db.js'
const url = new URL(process.env.DATABASE_URL)
if (
  process.env.NODE_ENV === 'production' ||
  url.pathname !== '/odin_messaging_app' ||
  url.searchParams.get('host') !== '/var/run/postgresql'
)
  throw new Error(
    'Seed is restricted to the dedicated local development database',
  )
try {
  const passwordHash = await bcrypt.hash('local-only-hello', 12)
  const users = []
  for (const [username, displayName, bio] of [
    ['mira_finch', 'Mira Finch', 'Collecting small moments and good books.'],
    ['theo_reed', 'Theo Reed', 'Usually thinking about the next coastal walk.'],
  ])
    users.push(
      await db.user.upsert({
        where: { username },
        update: {},
        create: { username, displayName, bio, passwordHash },
      }),
    )
  const [firstId, secondId] = users.map((user) => user.id).sort((a, b) => a - b)
  const conversation = await db.conversation.upsert({
    where: { firstId_secondId: { firstId, secondId } },
    update: {},
    create: { firstId, secondId },
  })
  if (!(await db.message.count({ where: { conversationId: conversation.id } })))
    await db.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          senderId: firstId,
          text: 'Found a little bookshop by the station today. You would love it.',
        },
        {
          conversationId: conversation.id,
          senderId: secondId,
          text: 'That sounds like a perfect Saturday plan. Shall we go next week?',
        },
      ],
    })
  console.log(
    'Fictional local accounts created: mira_finch and theo_reed. See seed source for local-only password.',
  )
} finally {
  await db.$disconnect()
  await pool.end()
}
