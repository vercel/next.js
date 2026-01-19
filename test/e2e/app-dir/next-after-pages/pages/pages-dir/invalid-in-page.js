import { after } from 'next/server'
import { cliLog } from '../../utils/log'

export async function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  after(() => {
    cliLog({
      source: '[pages-dir] /pages-dir/invalid-in-page',
    })
  })
  return <div>Invalid in Pages router Page component</div>
}
