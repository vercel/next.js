import styles from './style.module.css'

export default function Page() {
  console.log('CSSModules.styles', styles)
  return (
    <>
      <p className={`search-keyword ${styles.blue}`}>hello world</p>
      <p className={`${styles.blue}`}>
        <div className="nested">Red due to nesting</div>
      </p>
      <div className="red-text">This text should be red.</div>
    </>
  )
}
