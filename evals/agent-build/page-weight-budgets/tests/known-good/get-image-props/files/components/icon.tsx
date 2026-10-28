import { icons } from '@/lib/icon-paths'

// Server-only: keeps the icon set out of the client bundle. Client components
// receive rendered icons as props, or use <SpriteIcon> with a <Sprite> on the page.
export function Icon({
  name,
  size = 20,
  label,
}: {
  name: string
  size?: number
  label?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={icons[name]} />
    </svg>
  )
}
