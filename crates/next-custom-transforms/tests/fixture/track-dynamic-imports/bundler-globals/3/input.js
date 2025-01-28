export default async function Page() {
  await __webpack_load__('some-chunk')
  __webpack_require__('some_module_id')
  return null
}
