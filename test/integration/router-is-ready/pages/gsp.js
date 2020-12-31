import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  if (typeof window !== 'undefined') {
    if (!window.isReadyValues) {
      window.isReadyValues = []
    }
    window.isReadyValues.push(router.isReady)
  }

  return (
    <>
      <p id="gsp">gsp page</p>
      <p id="props">{JSON.stringify(props)}</p>
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
