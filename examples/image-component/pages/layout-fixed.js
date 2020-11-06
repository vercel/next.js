import Image from 'next/image'
import ViewSource from '../components/view-source'

const Fixed = () => (
  <div>
    <ViewSource pathname="pages/layout-fixed.js" />
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
