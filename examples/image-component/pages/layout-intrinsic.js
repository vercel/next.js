import Image from 'next/image'

const Intrinsic = () => (
  <div>
    <h1>Image Component With Layout Intrinsic</h1>
    <Image
      alt="Mountains"
      src="/mountains.jpg"
      layout="intrinsic"
      width={700}
      height={475}
    />
  </div>
)

export default Intrinsic
