// @ts-expect-error
// .home{font-weight:700}
import styles from 'data:text/css+module;base64,LmhvbWV7Zm9udC13ZWlnaHQ6NzAwfQo='
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
