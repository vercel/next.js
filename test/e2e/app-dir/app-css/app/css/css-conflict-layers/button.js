import styles from './button.module.css'

export function Button({ className = '' }) {
  return <div className={'btn ' + styles.button + ' ' + className}>Button</div>
}
