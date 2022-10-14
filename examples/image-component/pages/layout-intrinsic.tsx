import Image from 'next/image'
import ViewSource from '../components/view-source'
import mountains from '../public/mountains.jpg'

const Intrinsic = () => (
  <div>
    <ViewSource pathname="pages/layout-intrinsic.tsx" />
    <h1>Image Component With Layout Intrinsic</h1>
    <Image
      alt="Mountains"
      src={mountains}
      width={700}
      height={475}
      style={{
        maxWidth: '100%',
        height: 'auto',
      }}
    />
  </div>
)

export default Intrinsic
