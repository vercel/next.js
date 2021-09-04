import dynamic from 'next/dynamic'

const DynamicComponentWithCustomLoading = dynamic(
  () => import('../components/hello'),
  { loading: () => <p>...</p> },
  {
    loadableGenerated: {
      webpack: () => [require.resolveWeak('/some-project/src/some-file.js')],
      modules: ['/some-project/src/some-file.js -> ' + '../components/hello'],
    },
    loading: () => <p>...</p>,
  }
)
