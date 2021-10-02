import path from 'path'
import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { useRouter } from 'next/router'

export const getStaticProps = async ({ params }) => {
  const dbPath = path.join(process.cwd(), 'data.sqlite')
  console.log('using db', dbPath)

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  })

  const users = await db.all(`SELECT * FROM users`)

  return {
    props: {
      users,
      blog: true,
      params: params || null,
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: ['/blog/first'],
    fallback: true,
  }
}

export default function Page(props) {
  const router = useRouter()

  if (router.isFallback) {
    return 'Loading...'
  }

  return (
    <>
      <p id="blog">blog page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
