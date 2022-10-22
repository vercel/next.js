import Image from 'next/image'
import ViewSource from '../components/view-source'
import styles from '../styles.module.css'
import mountains from '../public/mountains.jpg'

const BackgroundPage = () => (
  <div>
    <ViewSource pathname="pages/background.tsx" />
    <div className={styles.bgWrap}>
      <Image
        alt="Mountains"
        src={bgImage}
        placeholder="blur"
        quality={100}
        layout="fill"
        sizes="100vw"
        objectFit="cover"
      />
    </div>
    <p className={styles.bgText}>
      Image Component
      <br />
      as a Background
    </p>
  </div>
)

export default BackgroundPage
