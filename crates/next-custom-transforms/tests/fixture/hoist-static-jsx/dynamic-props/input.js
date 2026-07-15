import { Icon } from './icon'

const styles = { card: 'card' }
const inputRef = { current: null }

export function Card({ onClick }) {
  return (
    <div className={styles.card}>
      <button onClick={onClick}>x</button>
      <Icon render={() => null} />
      <div {...styles} />
      <input ref={inputRef} />
    </div>
  )
}
