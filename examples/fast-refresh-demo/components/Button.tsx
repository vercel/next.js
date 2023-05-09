import styles from './Button.module.css'

type ButtonProps = {
  onClick: React.MouseEventHandler
  children: React.ReactNode
}

export default function Button({ children, ...props }: ButtonProps) {
  return (
    <button type="button" className={styles.btn} {...props}>
      {children}
    </button>
  )
}
