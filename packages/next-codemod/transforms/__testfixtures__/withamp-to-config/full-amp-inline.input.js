import { withAmp, withAmp as alternative } from 'next/amp'

export default alternative(function Home() {
  return <h1>My AMP Page</h1>
})
