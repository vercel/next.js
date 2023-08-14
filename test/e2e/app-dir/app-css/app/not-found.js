import styles from './not-found.module.css'
import Navigate404Section from '../components/navigate-404-section'

export default function RootNotFound() {
  return (
    <>
      <h1 className={'not-found ' + styles.blackBg}>Root not found</h1>
      <Navigate404Section />
    </>
  )
}
