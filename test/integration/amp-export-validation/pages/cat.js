export const config = { amp: true }

export default () => (
  <div>
    {/* I show a warning since the width and height attribute is missing */}
    <amp-video src="/cats.mp4" layout="responsive" />
  </div>
)
