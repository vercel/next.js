import { icons } from '@/lib/icon-paths'
import { STAR_PATH } from '@/lib/star-path'

// Defines shapes that a page draws many times (or swaps on the client) once,
// so <Stars> and <SpriteIcon> can reference them with <use> instead of
// repeating the long paths in the HTML and client bundle.
export function Sprite({
  icons: names = [],
  star = false,
}: {
  icons?: string[]
  star?: boolean
}) {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
      {star ? (
        <symbol id="rating-star" viewBox="0 0 24 24">
          <path d={STAR_PATH} />
        </symbol>
      ) : null}
      {names.map((name) => (
        <symbol key={name} id={`icon-${name}`} viewBox="0 0 24 24">
          <path d={icons[name]} />
        </symbol>
      ))}
    </svg>
  )
}
