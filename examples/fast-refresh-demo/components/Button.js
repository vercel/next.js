import styles from './Button.module.css'

export default function Button(props) {
  return <button type="button" className={styles.btn} {...props} />
}
