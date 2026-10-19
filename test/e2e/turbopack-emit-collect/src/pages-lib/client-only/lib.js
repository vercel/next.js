__turbopack_emit__('./unique.js', {
  namespace: 'my-test',
  data: 'data-for-unique-pages-client-only',
})

__turbopack_emit__('../../shared-pages-client.js', {
  namespace: 'my-test',
  data: 'data-for-shared-pages-client-only',
  scope: 'app',
})

export default function () {
  return 'client'
}
