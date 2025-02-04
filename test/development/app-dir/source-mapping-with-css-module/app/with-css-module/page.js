import styles from './page.module.css'

export default function Page() {
  throw new Error('boom')

  // eslint-disable-next-line
  return (
    <div className={styles.page}>
      <h1>Hello</h1>
    </div>
  )
}
