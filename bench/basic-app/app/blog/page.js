import path from 'path'
import { open } from 'sqlite'
import sqlite3 from 'sqlite3'

const getUsers = async () => {
  const dbPath = path.join(process.cwd(), 'data.sqlite')
  console.log('using db', dbPath)

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  })

  const users = await db.all(`SELECT * FROM users`)

  return users
}

export default async function Page() {
  return (
    <>
      <p id="blog">blog page</p>
      <p id="props">{JSON.stringify(await getUsers())}</p>
    </>
  )
}
