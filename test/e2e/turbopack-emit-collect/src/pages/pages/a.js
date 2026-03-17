import '../../pages-lib/a/lib'

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
      <code id="list">{JSON.stringify(list, null, 2)}</code>
    </div>
  )
}
