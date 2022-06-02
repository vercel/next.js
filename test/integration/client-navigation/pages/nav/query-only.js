import Link from 'next/link'
import { useRouter } from 'next/router'

export async function getServerSideProps({ query: { prop = '' } }) {
  return { props: { prop } }
}

export default function Page({ prop }) {
  const router = useRouter()
  return (
    <>
      <div id="prop">{prop}</div>
      <Link href="?prop=foo">
        <a id="link">Click me</a>
      </Link>
      <button id="router-push" onClick={() => router.push('?prop=bar')}>
        Push me
      </button>
      <button id="router-replace" onClick={() => router.replace('?prop=baz')}>
        Push me
      </button>
    </>
  )
}
