import type { SVGProps } from 'react'

export function CodeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="12"
      height="12"
      strokeLinejoin="round"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="m7.23 14.18 3-12 .18-.73-1.46-.36-.18.73-3 12-.18.73 1.46.36zm-3.48-2.12-.53-.53L.4 8.71a1 1 0 0 1 0-1.42l2.82-2.82.53-.53L4.81 5l-.53.53L1.81 8l2.47 2.47.53.53zm8.5 0 .53-.53 2.82-2.82a1 1 0 0 0 0-1.42l-2.82-2.82-.53-.53L11.19 5l.53.53L14.19 8l-2.47 2.47-.53.53z"
        fill="currentColor"
      />
    </svg>
  )
}
