import * as Icons from './icons'
import styles from './page.module.css'

const THEME = { accent: { color: 'teal' } }

export function Hero({ items }) {
  return (
    <section>
      <div className={styles.card}>
        <Icons.Check size={16} />
        <span style={THEME.accent}>ok</span>
        <b className={styles['card-title']}>t</b>
      </div>
      <div className={styles[items.length]}>x</div>
      <div className={items.style}>y</div>
    </section>
  )
}
