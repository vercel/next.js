export default async function Page() {
  await __turbopack_load__('some-chunk')
  __turbopack_require__('some_module_id')
  return null
}
