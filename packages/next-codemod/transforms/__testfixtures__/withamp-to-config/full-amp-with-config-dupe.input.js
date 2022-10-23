import { withAmp } from 'next/amp'

function Home() {
  return <h1>My AMP Page</h1>
}

export const config = {
  foo: 'bar',
  amp: false
}

export default withAmp(Home)
