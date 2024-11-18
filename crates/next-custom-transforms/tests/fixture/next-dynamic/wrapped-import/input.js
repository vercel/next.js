import dynamic from 'next/dynamic'
const DynamicComponent = dynamic(
  () => handleImport(import('./components/hello')),
  {
    loading: () => null,
    ssr: false,
  }
)
