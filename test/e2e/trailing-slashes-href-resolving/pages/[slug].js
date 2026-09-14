import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <>
      <p id="slug">top level slug {router.query.slug}</p>
    </>
  )
}

export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
      random: Math.random(),
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: ['/world', '/top-level-slug'],
    fallback: false,
  }
}
