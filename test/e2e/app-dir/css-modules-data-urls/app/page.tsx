// @ts-expect-error
import styles from 'data:text/css+module,.home{font-weight:700}'
import { ClientComponent } from './client'

export default function Home() {
  return (
    <>
      <div id="rsc" className={`${styles.home}`}>
        This text should be bold
      </div>
      <ClientComponent />
    </>
  )
}
