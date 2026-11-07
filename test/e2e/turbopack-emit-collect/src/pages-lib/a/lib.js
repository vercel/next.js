'use client'

__turbopack_emit__('./unique.js', {
  namespace: 'my-test',
  data: 'data-for-unique-pages-a',
})

__turbopack_emit__('../../shared-pages-client.js', {
  namespace: 'my-test',
  data: 'data-for-shared-pages-a',
  scope: 'app',
})
