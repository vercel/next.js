import ServerlessClient from 'serverless-postgres'

const client = new ServerlessClient({
  host: process.env.POSTGRESQL_HOST,
  port: Number(process.env.POSTGRESQL_PORT),
  user: process.env.POSTGRESQL_USER,
  password: process.env.POSTGRESQL_PASSWORD,
  database: process.env.POSTGRESQL_DATABASE,
  debug: true,
  ssl: {
    rejectUnauthorized: false,
  },
  delayMs: 3000,
})

export async function query(q: string, values: (string | number)[] = []) {
  try {
    await client.connect()
    const results = await client.query(q, values)
    await client.clean()
    return results.rows
  } catch (e) {
    throw Error(e.message)
  }
}
