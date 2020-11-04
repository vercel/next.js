import Image from 'next/image'

const Fixed = () => (
  <div>
    <h1>Image Component With Layout Fixed</h1>
    <Image
      alt="Mountains"
      src="/mountains.jpg"
      layout="fixed"
      width={700}
      height={475}
    />
  </div>
)

export default Fixed
