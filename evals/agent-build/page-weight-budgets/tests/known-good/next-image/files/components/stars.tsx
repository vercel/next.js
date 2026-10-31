import { STAR_PATH } from '@/lib/star-path'

const STAR_ID = 'ridgeline-star'

// Defines the star shape once per page; each star references it instead of repeating the path.
export function StarDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <path id={STAR_ID} d={STAR_PATH} />
      </defs>
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
          viewBox="0 0 24 24"
          fill={i <= Math.round(rating) ? '#e0a526' : '#d6d6d6'}
          aria-hidden
        >
          <use href={`#${STAR_ID}`} />
        </svg>
      ))}
    </span>
  )
}
