import Link from 'next/link'
import { useRouter } from 'next/router'

const Page = () => {
  const router = useRouter()
  return (
    <>
      <h1>Skeleton-Loading</h1>
      <h2>Default behavior</h2>
      <p>
        <Link href="/default/static/props">
          <a id="default-static">to page with static props</a>
        </Link>
        <br />
        <Link href="/default/serversideprops">
          <a id="default-ssp">to page with server-side props</a>
        </Link>
        <br />
        <Link href="/default/initialprops">
          <a id="default-ip">to page with initial props</a>
        </Link>
      </p>
      <h2>Skeleton Loading</h2>
      <p>
        <Link href="/skeleton/static/props" skeleton={{ world: 'skeleton' }}>
          <a id="skeleton-static">to page with static props</a>
        </Link>
        <br />
        <Link href="/skeleton/serversideprops" skeleton={{ world: 'skeleton' }}>
          <a id="skeleton-ssp">to page with server-side props</a>
        </Link>
        <br />
        <Link href="/skeleton/initialprops" skeleton={{ world: 'skeleton' }}>
          <a id="skeleton-ip">to page with initial props</a>
        </Link>
        <br />
        <button
          id="skeleton-push"
          onClick={() => {
            router.push('/skeleton/serversideprops', undefined, {
              skeleton: { world: 'skeleton' },
            })
          }}
        >
          imperartive navigation
        </button>
      </p>
    </>
  )
}

export default Page
