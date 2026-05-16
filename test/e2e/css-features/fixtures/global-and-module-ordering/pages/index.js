import styles1 from './index.module.css'
import styles2 from './index2.module.css'

export default function Home() {
  return (
    <>
      <div id="yellowText" className={`${styles1.textModule} textGlobal`}>
        This text should be yellow.
      </div>
      <div
        id="blueText"
        className={`${styles1.textModule} ${styles2.textModule} textGlobal`}
      >
        This text should be blue.
      </div>
    </>
  )
}
