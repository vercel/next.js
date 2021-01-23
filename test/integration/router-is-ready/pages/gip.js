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
      <p id="gssp">gssp page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

Page.getInitialProps = () => {
  return {
    hello: 'world',
    random: Math.random(),
  }
}
