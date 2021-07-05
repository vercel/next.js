export const config = { amp: true }

const DogCat = () => (
  <div>
    {/* I throw an error since <amp-img/> should be used instead */}
    <img src="/dog.gif" height={400} width={800} />
  </div>
)

export default DogCat
