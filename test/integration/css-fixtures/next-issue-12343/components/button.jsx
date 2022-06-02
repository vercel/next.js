import styles from './button.module.css'

export const Button = ({ className, ...rest }) => (
  <a className={`${styles.button} ${className}`} {...rest} />
)
