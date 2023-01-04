import Image from 'next/legacy/image'
import ViewSource from '../components/view-source'
import styles from '../styles.module.css'

const BackgroundPage = () => (
  <div>
    <ViewSource pathname="pages/background.tsx" />
    <div className={styles.bgWrap}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        objectFit="cover"
        quality={100}
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
