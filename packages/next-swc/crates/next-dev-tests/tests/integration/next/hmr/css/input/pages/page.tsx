import { useTestHarness } from '@turbo/pack-test-harness'
import styles from './page.module.css'

export default function Page() {
  useTestHarness((harness) => harness.markAsHydrated())

  return (
    <div id="element" className={styles.page}>
      Hello Worls
    </div>
  )
}
