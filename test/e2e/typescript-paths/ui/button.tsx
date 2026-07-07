import styles from './style.module.css'

export default function Button(props: any) {
  return <button {...props} className={styles.button} />
}
