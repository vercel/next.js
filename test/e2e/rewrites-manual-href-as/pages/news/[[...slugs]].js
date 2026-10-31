import Link from 'next/link'
import { useRouter } from 'next/router'

export default function News() {
  const { asPath, pathname, query } = useRouter()

  return (
    <div>
      <h1 id="news">news page</h1>
      <p id="asPath">{asPath}</p>
      <p id="pathname">{pathname}</p>
      <p id="query">{JSON.stringify(query)}</p>
      <Link href="/">&larr; Back home</Link>
    </div>
  )
}

export async function getServerSideProps() {
  return {
    props: {},
  }
}
