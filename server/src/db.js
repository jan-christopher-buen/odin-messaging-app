import { PrismaClient } from '../generated/client/index.js'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
export const db = new PrismaClient({ adapter: new PrismaPg(pool) })
export const publicUser = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
}
