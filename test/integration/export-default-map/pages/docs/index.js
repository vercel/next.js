import { useAmp, withAmp } from 'next/amp'

export default withAmp(() => (
  <p>I'm an {useAmp() ? 'AMP' : 'normal'} page</p>
), { hybrid: true })
