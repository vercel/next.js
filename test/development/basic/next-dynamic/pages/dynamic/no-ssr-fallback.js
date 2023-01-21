import dynamic from 'next/dynamic'

const Hello = dynamic(import('../../components/hello1'), {
  ssr: false,
  fallback: true,
})

export default () => (
  <div>
    <Hello fallback={<p>Loading 1</p>} />
    <Hello fallback={<p>Loading 2</p>} />
  </div>
)
