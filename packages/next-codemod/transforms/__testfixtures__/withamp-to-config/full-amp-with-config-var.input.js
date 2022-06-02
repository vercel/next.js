import { withAmp } from 'next/amp'

function Home() {
  const config = {}
  return <h1>My AMP Page</h1>
}

const config = {
  foo: 'bar',
}

export default withAmp(Home)

export { config }
