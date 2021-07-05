import { useAmp } from 'next/amp'

export const config = { amp: 'hybrid' }

const Index = () => <p>I'm an {useAmp() ? 'AMP' : 'normal'} page</p>

export default Index
