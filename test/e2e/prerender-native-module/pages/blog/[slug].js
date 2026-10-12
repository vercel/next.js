import path from 'path'
import { open } from 'native-addon-wrapper'
import nativeAddon from 'native-addon'
import { useRouter } from 'next/router'

export const getStaticProps = async ({ params }) => {
  // The `process.cwd()` join stays in the page on purpose. Output file tracing
  // only follows it into the trace from the app's own code, so moving it into
  // `native-addon-wrapper` would stop `users.json` being traced.
  const dataPath = path.join(process.cwd(), 'users.json')
  console.log('using data', dataPath)

  const db = await open({
    filename: dataPath,
    driver: nativeAddon,
  })

  const users = await db.all()

  return {
    props: {
      users,
      // Read off the compiled binary, so a native module that failed to load
      // shows up here rather than passing quietly.
      contextAware: db.contextAware,
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
