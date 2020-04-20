import styles from './index.module.css'

export default function Home() {
  return (
    <div id="blueText" className={`${styles.textModule} textGlobal`}>
      This text should be blue.
    </div>
  )
}
