__turbopack_emit__('./a.js', {
  namespace: 'my-test',
  data: 'data-for-a',
})

__turbopack_emit__('./c.js', {
  namespace: 'my-test',
  data: 'data-for-c',
  exports: ['c'],
})

export default function () {
  import('./async')
}

__turbopack_emit__('./b.js', {
  namespace: 'my-test',
  data: 'more-data-for-b',
})
