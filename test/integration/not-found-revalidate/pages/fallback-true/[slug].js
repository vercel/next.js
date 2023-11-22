import path from 'path'
import fs from 'fs'
import fsp from 'fs/promises'
import { useRouter } from 'next/router'

export default function Page(props) {
  if (useRouter().isFallback) return 'Loading...'

  return (
    <>
      <p id="fallback-true">fallback true page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = async ({ params }) => {
  const { slug } = params

  if (!slug) {
    throw new Error(`missing slug value for /fallback-true/[slug]`)
  }

  const dir = path.join(process.cwd(), '.tmp/fallback-true', slug)

  if (fs.existsSync(dir)) {
    return {
      props: {
        params,
        found: true,
        hello: 'world',
        random: Math.random(),
      },
      revalidate: 1,
    }
  }

  await fsp.mkdir(dir, { recursive: true })

  return {
    notFound: true,
    revalidate: 1,
  }
}

export const getStaticPaths = async () => {
  await fsp.rm(path.join(process.cwd(), '.tmp/fallback-true'), {
    recursive: true,
    force: true,
  })

  return {
    paths: [],
    fallback: true,
  }
}
