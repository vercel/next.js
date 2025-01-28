// should handle multiple references to the same global

export default async function Page() {
  await __turbopack_load__('some-chunk')
  await __turbopack_load__('another-chunk')
  __turbopack_require__('some_module_id')
  __turbopack_require__('another_module_id')
  return null
}
