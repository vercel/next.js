__turbopack_emit__('./a.js', {
  namespace: 'my-test',
  data: 'data-for-a',
  scope: 'app',
})

export default function () {
  import('./async')
}
