import styles from './page.module.css'

export default function Page() {
  return (
    <>
      <pre id="class-map">{JSON.stringify(styles)}</pre>
      <p id="module" className={styles.someClass}>
        module
      </p>
      <p id="global" className="global-class">
        global
      </p>
    </>
  )
}
