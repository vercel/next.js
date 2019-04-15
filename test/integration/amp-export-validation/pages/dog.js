import { withAmp } from 'next/amp'

export default withAmp(() => (
  <div>
    {/* I throw an error since <amp-img/> should be used instead */}
    <img src='/dog.gif' height={400} width={800} />
  </div>
))
