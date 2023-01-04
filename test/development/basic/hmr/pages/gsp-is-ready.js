import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()
  return (
    <>
      <p>getStaticProps router.isReady</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="ready">{router.isReady ? 'yes' : 'no'}</p>
    </>
  )
}

export function getStaticProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}
