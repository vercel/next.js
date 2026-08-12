import dynamic from 'next/dynamic'
import { collectResult } from '../../collect-result'

const Client = dynamic(() => import('../../pages-lib/client-only/lib'), {
  ssr: false,
})

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

export async function getServerSideProps() {
  return {
    props: {
      result: await collectResult(getList),
    },
  }
}

export default function Page({ result }) {
  return (
    <div>
      <Client />
      <code id="list">{JSON.stringify(result, null, 2)}</code>
    </div>
  )
}
