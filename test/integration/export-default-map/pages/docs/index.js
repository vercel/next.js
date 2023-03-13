import { useAmp } from 'next/amp'

export const config = { amp: 'hybrid' }

export default () => <p>I'm an {useAmp() ? 'AMP' : 'normal'} page</p>
