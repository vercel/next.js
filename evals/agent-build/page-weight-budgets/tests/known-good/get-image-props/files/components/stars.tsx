// Draws the star from a <Sprite star /> on the page.
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
          <use href="#rating-star" />
        </svg>
      ))}
    </span>
  )
}
