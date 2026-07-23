'use client'
import { describeDataLayer } from './vendor-data'
export default function UsageMeter({ fraction, label }) {
  return (
    <span
      className="usage-meter"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      aria-label={label}
    >
      <span
        className="usage-meter-fill"
        style={{ width: Math.round(fraction * 100) + '%' }}
      />
    </span>
  )
}

export const __layers = [describeDataLayer].length
