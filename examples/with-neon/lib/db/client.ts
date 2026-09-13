import { attachDatabasePool } from '@vercel/functions'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as authSchema from '@/lib/auth/schema'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

attachDatabasePool(pool)

export const db = drizzle(pool, { schema: { ...authSchema } })

export async function checkDbConnection(): Promise<string> {
  if (!process.env.DATABASE_URL) {
    return 'No DATABASE_URL environment variable'
  }
  try {
    await pool.query('SELECT version()')
    return 'Database connected'
  } catch (error) {
    console.error('Error connecting to the database:', error)
    return 'Database not connected'
  }
}
