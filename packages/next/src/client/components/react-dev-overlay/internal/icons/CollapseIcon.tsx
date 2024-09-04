export function CollapseIcon({ collapsed }: { collapsed?: boolean } = {}) {
  return (
    <svg
      data-nextjs-call-stack-chevron-icon
      data-collapsed={collapsed}
      fill="none"
      height="20"
      width="20"
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      // rotate 90 degrees if not collapsed.
      // If collapsed isn't present, the rotation is applied via the `data-nextjs-collapsed-call-stack-details` element's `open` attribute
      {...(typeof collapsed === 'boolean'
        ? { style: { transform: collapsed ? undefined : 'rotate(90deg)' } }
        : {})}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
