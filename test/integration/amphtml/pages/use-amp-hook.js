import {useAmp} from 'next/amp'

export default () => {
  const isAmp = useAmp()
  return `Hello ${isAmp ? 'AMP' : 'others'}`
}
