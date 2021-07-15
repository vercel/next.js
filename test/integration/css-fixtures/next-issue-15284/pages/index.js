import styles from './styles/index.module.css'
import Banner from '../components/Banner/Banner'

export default function Index() {
  return <Banner id="home" className={styles.bannerOverride} href="/test" />
}
