import '../../pages-lib/a/lib'
import { collectResult } from '../../collect-result'

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
      <code id="list">{JSON.stringify(result, null, 2)}</code>
    </div>
  )
}
