export async function collectResult(getList) {
  const list = await Promise.all(
    getList().map(async (v) => ({
      id: v.id,
      data: v.data,
      import: (await v.import()).default,
    }))
  )

  return {
    list,
    // Read after the imports above have resolved, so that anything reachable
    // only through a lazily loaded chunk is installed by now.
    // eslint-disable-next-line no-undef
    modules: Array.from(__turbopack_modules__.keys()),
  }
}
