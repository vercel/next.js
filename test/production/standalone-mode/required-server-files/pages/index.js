import { useRouter } from 'next/router'
import Link from 'next/link'
import getConfig from '../lib/config'

const localConfig = getConfig()

if (localConfig.hello !== 'world') {
  throw new Error('oof import order is wrong, _app comes first')
}

let gspCalls = 0

export const getStaticProps = () => {
  gspCalls += 1

  return {
    props: {
      hello: 'world',
      random: Math.random(),
      gspCalls,
    },
    revalidate: 1,
  }
}

export default function Page(props) {
  const router = useRouter()
  return (
    <>
      <p id="index">index page</p>
      <p id="router">{JSON.stringify(router)}</p>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="gsp">to /gsp</Link>
    </>
  )
}
