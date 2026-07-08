import styles from './page.module.css'

export default function Page() {
  // Render the compiled class name into an attribute so the test can read it
  // out of the HTML without a browser.
  return (
    <div id="box" className={styles.box}>
      Hello
    </div>
  )
}
