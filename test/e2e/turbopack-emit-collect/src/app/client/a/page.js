import './lib'

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

export default async function page() {
  const list = await Promise.all(
    getList().map(async (v) => ({
      id: v.id,
      data: v.data,
      import: (await v.import()).default,
    }))
  )

  return (
    <div>
      <code id="list">{JSON.stringify(list, null, 2)}</code>
    </div>
  )
}
