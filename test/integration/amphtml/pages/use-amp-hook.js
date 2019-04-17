import { useAmp, withAmp } from 'next/amp'

export default withAmp(() => {
  const isAmp = useAmp()
  return `Hello ${isAmp ? 'AMP' : 'others'}`
}, { hybrid: true })
