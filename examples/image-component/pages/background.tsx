import Image from 'next/image'
import ViewSource from '../components/view-source'
import { bgWrap, bgText } from '../styles.module.css'

export default function Background() {
  return (
    <div>
      <ViewSource pathname="pages/background.tsx" />
      <div className={bgWrap}>
        <Image
          alt="Mountains"
          src="/mountains.jpg"
          layout="fill"
          objectFit="cover"
          quality={100}
        />
      </div>
      <p className={bgText}>
        Image Component
        <br />
        as a Background
      </p>
    </div>
  )
}
