import { withAmp } from 'next/amp'

function Home() {
  const config = {}
  return <h1>My AMP Page</h1>
}

export default withAmp(Home)
