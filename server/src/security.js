import session from 'express-session'
import connectPg from 'connect-pg-simple'
import { Passport } from 'passport'
import { Strategy } from 'passport-local'
import bcrypt from 'bcrypt'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { db, pool, publicUser } from './db.js'
export const cookieName =
  process.env.NODE_ENV === 'production' ? '__Host-signal' : 'signal.sid'
export function authentication(app) {
  const production = process.env.NODE_ENV === 'production'
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters')
  if (production && !process.env.APP_ORIGIN?.startsWith('https://'))
    throw new Error('APP_ORIGIN must use HTTPS')
  // Render is the only trusted hop. Never trust arbitrary forwarded chains.
  app.set('trust proxy', production ? 1 : false)
  app.use(
    session({
      name: cookieName,
      store: new (connectPg(session))({ pool, tableName: 'session' }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: production,
        sameSite: 'lax',
        maxAge: 604800000,
      },
    }),
  )
  const passport = new Passport()
  passport.use(
    new Strategy(async (username, password, done) => {
      try {
        const user = await db.user.findUnique({
          where: { username: username.trim().toLowerCase() },
        })
        const valid = await bcrypt.compare(
          password,
          user?.passwordHash ||
            '$2b$12$QGNn1V7Y1ZtJdB3Zc3pXOuXvrZFAKzZ31DULM3n8NqTFnC0uDW3ca',
        )
        done(null, valid && user ? user : false)
      } catch (error) {
        done(error)
      }
    }),
  )
  passport.serializeUser((user, done) => done(null, user.id))
  passport.deserializeUser(async (id, done) => {
    try {
      done(
        null,
        await db.user.findUnique({ where: { id }, select: publicUser }),
      )
    } catch (error) {
      done(error)
    }
  })
  app.use(passport.initialize(), passport.session())
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    const supplied = req.get('X-CSRF-Token') || ''
    const expected = req.session.csrf || ''
    if (
      req.get('Origin') !== process.env.APP_ORIGIN ||
      !expected ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      return res
        .status(403)
        .json({ error: 'Request verification failed. Refresh and try again.' })
    next()
  })
  return passport
}
export function token(req) {
  return (req.session.csrf ||= randomBytes(32).toString('hex'))
}
export function requireUser(req, res, next) {
  if (!req.user)
    return res.status(401).json({ error: 'Please log in to continue.' })
  next()
}
