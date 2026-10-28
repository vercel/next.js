// Same output as <Icon>, but draws the shape from a <Sprite> on the page, so it
// can be used in client components without bundling the icon set.
export function SpriteIcon({
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
      <use href={`#icon-${name}`} />
    </svg>
  )
}
