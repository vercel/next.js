export default () => (
  <div>
    {/* I throw an error since <amp-img/> should be used instead */}
    <img src='/dog.gif' height={400} width={800} />
    {/* I show a warning since the amp-video script isn't added */}
    <amp-video src='/cats.mp4' height={400} width={800} />
  </div>
)
