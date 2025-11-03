import styles from './home.module.css'
import pure from './pure.module.css'

export default function Home() {
  return (
    <div id="my-div" className={`${styles.home} ${pure.root} global`}>
      <div>This text should be bold</div>
    </div>
  )
}
