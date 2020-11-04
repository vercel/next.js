import Image from 'next/image'
import { bgWrap, bgText, objectFitCover } from '../styles.module.css'

const Background = () => (
  <div>
    <div className={bgWrap}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        quality={100}
        className={objectFitCover}
      />
    </div>
    <p className={bgText}>
      Image Component
      <br />
      as a Background
    </p>
  </div>
)

export default Background
