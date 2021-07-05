import dynamic from 'next/dynamic'

const BrowserLoaded = dynamic(async () => () => <div>Browser hydrated</div>, {
  ssr: false,
})

const Nested2 = () => (
  <div>
    <div>Nested 2</div>
    <BrowserLoaded />
  </div>
)

export default Nested2
