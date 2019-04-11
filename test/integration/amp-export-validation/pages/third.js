import { withAmp } from 'next/amp'

export default withAmp(() => (
  'I am a hybrid AMP page'
), { hybrid: true })
