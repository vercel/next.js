import { withAmp } from 'next/amp'

export default withAmp(() => (
  <>
    <p>I'm an AMP page!</p>
    <span>{new Date().getTime()}</span>
  </>
))
