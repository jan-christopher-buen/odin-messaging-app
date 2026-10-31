import { createApp } from './app.js'
import { db, pool } from './db.js'
const server = createApp().listen(process.env.PORT || 3000, () =>
  console.log('Signal Post API is listening'),
)
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(async () => {
      await db.$disconnect()
      await pool.end()
      process.exit(0)
    }),
  )
