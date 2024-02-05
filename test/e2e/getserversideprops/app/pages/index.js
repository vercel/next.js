import Link from 'next/link'
import ReactDOM from 'react-dom/server'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
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
      <Link href="/non-json" id="non-json">
        to non-json
      </Link>
      <br />
      <Link href="/another" id="another">
        to another
      </Link>
      <br />
      <Link href="/something" id="something">
        to something
      </Link>
      <br />
      <Link href="/normal" id="normal">
        to normal
      </Link>
      <br />
      <Link href="/slow" id="slow">
        to slow
      </Link>
      <br />
      <Link href="/blog/[post]" as="/blog/post-1" id="post-1">
        to dynamic
      </Link>
      <Link href="/blog/[post]" as="/blog/post-100" id="broken-post">
        to broken
      </Link>
      <br />
      <Link
        href="/blog/[post]/[comment]"
        as="/blog/post-1/comment-1"
        id="comment-1"
      >
        to another dynamic
      </Link>
      <Link href="/something?another=thing" id="something-query">
        to something?another=thing
      </Link>
    </>
  )
}

export default Page
