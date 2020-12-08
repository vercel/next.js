import Image from 'next/image'
import ViewSource from '../components/view-source'

const Fill = () => (
  <div>
    <ViewSource pathname="pages/layout-fill.js" />
    <h1>Image Component With Layout Fill</h1>
    <div style={{ position: 'relative', width: '300px', height: '500px' }}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        objectFit="cover"
      />
    </div>
    <div style={{ position: 'relative', width: '300px', height: '500px' }}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        objectFit="contain"
      />
    </div>
    <div style={{ position: 'relative', width: '300px', height: '500px' }}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        objectFit="none"
        quality={100}
      />
    </div>
  </div>
)

export default Fill
