import { useAmp } from 'next/amp'

export const config = { amp: 'hybrid' }

const Info = () => <p>I'm an {useAmp() ? 'AMP' : 'normal'} page</p>

export default Info
