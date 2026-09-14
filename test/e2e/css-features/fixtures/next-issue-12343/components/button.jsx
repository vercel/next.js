import styles from './button.module.css'

export const Button = ({ className, ...rest }) => (
  <span className={`${styles.button} ${className}`} {...rest} />
)
