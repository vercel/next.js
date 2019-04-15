import { withAmp } from 'next/amp'

export default withAmp(() => (
  <div>
    {/* I show a warning since the amp-video script isn't added */}
    <amp-video src='/cats.mp4' height={400} width={800} />
  </div>
))
