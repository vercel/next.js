import { useRouter } from 'next/router'
import getConfig from '../lib/config'

const localConfig = getConfig()

if (localConfig.hello !== 'world') {
  throw new Error('oof import order is wrong, _app comes first')
}

export const getServerSideProps = ({ req }) => {
  return {
    props: {
      hello: 'world',
      random: Math.random(),
    },
  }
}

export default function Page(props) {
  const router = useRouter()
  return (
    <>
      <p id="index">index page</p>
      <p id="router">{JSON.stringify(router)}</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
