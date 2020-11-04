import Image from 'next/image'
import {
  objectFitContain,
  objectFitCover,
  objectFitNone,
} from '../styles.module.css'

const Fill = () => (
  <div>
    <h1>Image Component With Layout Fill</h1>
    <div style={{ position: 'relative', width: '300px', height: '500px' }}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        className={objectFitCover}
      />
    </div>
    <div style={{ position: 'relative', width: '300px', height: '500px' }}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        className={objectFitContain}
      />
    </div>
    <div style={{ position: 'relative', width: '300px', height: '500px' }}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        className={objectFitNone}
        quality={100}
      />
    </div>
  </div>
)

export default Fill
