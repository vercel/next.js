import Image from 'next/image'
import {
  containedWrap,
  containedPageLayout,
  containedText,
} from '../styles.module.css'

const Contained = () => (
  <div className={containedPageLayout}>
    <ViewSource pathname="pages/contained.js" />
    <div className={containedWrap}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        objectFit="cover"
        priority
        quality={100}
        width={2800}
        height={1900}
      />
      <div>
        <span className={containedText}>
          This image was resized, without distortions!
        </span>
      </div>
    </div>
  </div>
)

export default Contained
