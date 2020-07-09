import styles from './product-quantity.module.css'

export default function ProductQuantity({
  value,
  min,
  max,
  disabled,
  onChange,
  onIncrease,
  ...props
}) {
  return (
    <div className="flex h-12">
      <button
        type="button"
        className={styles.quantityControl}
        disabled={disabled || (min ? Number(value) <= min : false)}
        onClick={() => onIncrease(-1)}
      >
        -
      </button>
      <input
        type="number"
        className={styles.quantity}
        value={value}
        onChange={onChange}
        disabled={disabled}
        min="0"
        step="1"
        {...props}
      />
      <button
        type="button"
        className={styles.quantityControl}
        disabled={disabled || (max ? Number(value) >= max : false)}
        onClick={() => onIncrease(1)}
      >
        +
      </button>
    </div>
  )
}
