import './lib'

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

export async function GET(_req) {
  const list = await Promise.all(
    getList().map(async (v) => ({
      id: v.id,
      data: v.data,
      import: (await v.import()).default,
    }))
  )

  return Response.json(list, { status: 200 })
}
