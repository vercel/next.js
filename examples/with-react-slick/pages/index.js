import ReactSlickSlider from '../components/ReactSlick'
import styles from '../styles/Home.module.css'
import 'slick-carousel/slick/slick.css'
import 'slick-carousel/slick/slick-theme.css'
export default function Home() {
  return (
    <div className={styles.container}>
      <h1>React slick</h1>
      <div className={styles.sliderContainer}>
        <ReactSlickSlider />
      </div>
    </div>
  )
}
