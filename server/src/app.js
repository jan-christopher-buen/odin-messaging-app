import express from 'express'
import helmet from 'helmet'
import { authentication } from './security.js'
import { routes } from './routes.js'
export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet(), express.json({ limit: '24kb' }))
  const passport = authentication(app)
  app.get('/health', (_req, res) => res.json({ status: 'ok' }))
  app.use('/api', routes(passport))
  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }))
  app.use((error, _req, res, _next) => {
    const status =
      error.status || (error.type === 'entity.parse.failed' ? 400 : 500)
    if (status === 500)
      console.error('Request failed:', error.code || error.name)
    res.status(status).json({
      error:
        status >= 500
          ? 'Something went wrong. Please try again.'
          : error.message,
    })
  })
  return app
}
