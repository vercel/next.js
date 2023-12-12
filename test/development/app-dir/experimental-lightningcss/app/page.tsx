import styles from './style.module.css'

export default function Page() {
  console.log('CSSModules.styles', styles)
  return (
    <>
      <p className={`search-keyword ${styles.blue}`}>hello world</p>
      <div className="red-text">This text should be red.</div>
    </>
  )
}
