import { useAmp } from 'next/amp'

const config = {
  amp: true,
}

export default () => (useAmp() ? 'AMP mode' : 'Normal mode')
export { config }
