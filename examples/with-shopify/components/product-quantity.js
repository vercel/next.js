import cn from 'classnames'
import styles from './product-quantity.module.css'

export default function ProductQuantity({ loading, onIncrease, ...props }) {
  return (
    <div className={cn({ 'opacity-50': loading })}>
      <button
        type="button"
        className={styles.quantityControl}
        disabled={loading}
        onClick={() => onIncrease(-1)}
      >
        -
      </button>
      <input
        className={styles.quantity}
        type="number"
        min="0"
        step="1"
        disabled={loading}
        {...props}
      />
      <button
        type="button"
        className={styles.quantityControl}
        disabled={loading}
        onClick={() => onIncrease(1)}
      >
        +
      </button>
    </div>
  )
}
