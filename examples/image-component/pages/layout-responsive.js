import Image from 'next/image'

const Responsive = () => (
  <div>
    <h1>Image Component With Layout Responsive</h1>
    <Image
      alt="Mountains"
      src="/mountains.jpg"
      layout="responsive"
      width={700}
      height={475}
    />
  </div>
)

export default Responsive
