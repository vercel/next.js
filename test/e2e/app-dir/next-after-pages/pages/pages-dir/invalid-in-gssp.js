import { after } from 'next/server'
import { cliLog } from '../../utils/log'

export async function getServerSideProps() {
  after(() => {
    cliLog({
      source: '[pages-dir] /pages-dir/invalid-in-gssp',
    })
  })
  return { props: {} }
}

export default function Page() {
  return <div>Invalid in getServerSideProps</div>
}
