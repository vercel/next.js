import { unstable_after as after } from 'next/server'
import { persistentLog } from '../../utils/log'

export async function getServerSideProps() {
  after(() => {
    persistentLog({
      source: '[pages-dir] /pages-dir/invalid-in-gssp',
    })
  })
  return { props: {} }
}

export default function Page() {
  return <div>Invalid in getServerSideProps</div>
}
