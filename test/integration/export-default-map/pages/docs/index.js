import { useAmp } from 'next/amp'

export default () => (
  <p>I'm an {useAmp() ? 'AMP' : 'normal'} page</p>
)
