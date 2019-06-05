import { withAmp } from 'next/amp'

export default withAmp(() => <p>I'm a hybrid AMP page!</p>, { hybrid: true })
