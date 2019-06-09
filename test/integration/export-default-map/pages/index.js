import { withAmp } from 'next/amp'
export default withAmp(() => <p>Simple hybrid amp/non-amp page</p>, {
  hybrid: true
})
