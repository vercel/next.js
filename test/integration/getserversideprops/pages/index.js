import Link from 'next/link'
import ReactDOM from 'react-dom/server'
import { RouterContext } from 'next/dist/shared/lib/router-context'
import { useRouter } from 'next/router'

function RouterComp(props) {
  const router = useRouter()

  if (!router) {
    throw new Error('router is missing!')
  }

  return (
    <>
      <p>props {JSON.stringify(props)}</p>
      <p>router: {JSON.stringify(router)}</p>
    </>
  )
}

export async function getServerSideProps({ req, query, preview }) {
  // this ensures the same router context is used by the useRouter hook
  // no matter where it is imported
  console.log(
    ReactDOM.renderToString(
      <RouterContext.Provider
        value={{
          query,
          pathname: '/',
          asPath: req.url,
          isPreview: preview,
        }}
      >
        <p>hello world</p>
        <RouterComp hello={'world'} />
      </RouterContext.Provider>
    )
  )
  return {
    props: {
      url: req.url,
      world: 'world',
      time: new Date().getTime(),
    },
  }
}

const Page = ({ world, time, url }) => {
  if (typeof window === 'undefined') {
    if (url.startsWith('/_next/data/')) {
      throw new Error('invalid render for data request')
    }
  }

  return (
    <>
      <p>hello {world}</p>
      <span>time: {time}</span>
      <Link href="/non-json">
        <a id="non-json">to non-json</a>
      </Link>
      <br />
      <Link href="/another">
        <a id="another">to another</a>
      </Link>
      <br />
      <Link href="/something">
        <a id="something">to something</a>
      </Link>
      <br />
      <Link href="/normal">
        <a id="normal">to normal</a>
      </Link>
      <br />
      <Link href="/slow">
        <a id="slow">to slow</a>
      </Link>
      <br />
      <Link href="/blog/[post]" as="/blog/post-1">
        <a id="post-1">to dynamic</a>
      </Link>
      <Link href="/blog/[post]" as="/blog/post-100">
        <a id="broken-post">to broken</a>
      </Link>
      <br />
      <Link href="/blog/[post]/[comment]" as="/blog/post-1/comment-1">
        <a id="comment-1">to another dynamic</a>
      </Link>
      <Link href="/something?another=thing">
        <a id="something-query">to something?another=thing</a>
      </Link>
    </>
  )
}

export default Page
