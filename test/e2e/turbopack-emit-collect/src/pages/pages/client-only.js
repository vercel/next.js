import dynamic from 'next/dynamic'

const Client = dynamic(() => import('../../pages-lib/client-only/lib'), {
  ssr: false,
})

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

export async function getServerSideProps() {
  const list = await Promise.all(
    getList().map(async (v) => ({
      id: v.id,
      data: v.data,
      import: (await v.import()).default,
    }))
  )

  return {
    props: {
      list,
    },
  }
}

export default function Page({ list }) {
  return (
    <div>
      <Client />
      <code id="list">{JSON.stringify(list, null, 2)}</code>
    </div>
  )
}
