import path from 'path'
import fs from 'fs-extra'

export default function Page(props) {
  return (
    <>
      <p id="fallback-blocking">fallback blocking page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = async ({ params }) => {
  const { slug } = params

  if (!slug) {
    throw new Error(`missing slug value for /fallback-true/[slug]`)
  }

  const dir = path.join(process.cwd(), '.tmp/fallback-blocking', slug)

  if (await fs.exists(dir)) {
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

  await fs.ensureDir(dir)

  return {
    notFound: true,
    revalidate: 1,
  }
}

export const getStaticPaths = async () => {
  await fs.remove(path.join(process.cwd(), '.tmp/fallback-blocking'))

  return {
    paths: [],
    fallback: 'blocking',
  }
}
