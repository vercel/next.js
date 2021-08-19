import { useRouter } from 'next/router'

export const getStaticProps = ({ params }) => {
  return {
    props: {
      hello: 'world',
      slug: params.slug,
      random: Math.random(),
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: ['/fallback/first'],
    fallback: true,
  }
}

export default function Page(props) {
  const router = useRouter()
  return (
    <>
      <p id="fallback">fallback page</p>
      <p id="slug">{props.slug}</p>
      <p id="router">{JSON.stringify(router)}</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
