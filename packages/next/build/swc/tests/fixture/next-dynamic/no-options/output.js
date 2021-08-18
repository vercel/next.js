import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/hello'), {
  loadableGenerated: {
    webpack: () => [require.resolveWeak('/some-project/src/some-file.js')],
    modules: ['/some-project/src/some-file.js -> ' + '../components/hello'],
  },
})
