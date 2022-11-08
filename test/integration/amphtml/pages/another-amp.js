import { useAmp } from 'next/amp'

export const config = {
  amp: true,
}

export default () => (useAmp() ? 'AMP mode' : 'Normal mode')
