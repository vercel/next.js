export function CollapseIcon({ collapsed }: { collapsed?: boolean } = {}) {
  return (
    <svg
      data-nextjs-call-stack-chevron-icon
      data-collapsed={collapsed}
      width="16"
      height="16"
      fill="none"
      // rotate 90 degrees if not collapsed.
      {...(typeof collapsed === 'boolean'
        ? { style: { transform: collapsed ? undefined : 'rotate(90deg)' } }
        : {})}
    >
      <path
        fill="#666"
        fillRule="evenodd"
        d="m6.75 3.94.53.53 2.824 2.823a1 1 0 0 1 0 1.414L7.28 11.53l-.53.53L5.69 11l.53-.53L8.69 8 6.22 5.53 5.69 5l1.06-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  )
}
