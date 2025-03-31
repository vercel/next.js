import styles from './index.module.css'

export default function Home() {
  return (
    <div id="my-div" className={`${styles.home} global`}>
      <div>This text should be bold</div>
    </div>
  )
}
