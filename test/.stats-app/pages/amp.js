import { useAmp } from 'next/amp'

export const config = {
  amp: 'hybrid',
}

export default function Amp(props) {
  return useAmp() ? 'AMP mode' : 'normal mode'
}
