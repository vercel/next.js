import { STAR_PATH } from '@/lib/star-path'

// The star path is defined once per document; each star references it.
export function StarSymbol() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <symbol id="star" viewBox="0 0 24 24">
        <path d={STAR_PATH} />
      </symbol>
    </svg>
  )
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" role="img" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width="14"
          height="14"
          fill={i <= Math.round(rating) ? '#e0a526' : '#d6d6d6'}
          aria-hidden
        >
          <use href="#star" />
        </svg>
      ))}
    </span>
  )
}
