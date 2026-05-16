import type { ComponentProps } from 'react'

export function ThumbsDown(props: ComponentProps<'svg'>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="thumbs-down-icon"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.89531 12.7603C5.72984 12.8785 5.5 12.7602 5.5 12.5569V9.75C5.5 8.7835 4.7165 8 3.75 8H1.5V1.5H11.1884C11.762 1.5 12.262 1.89037 12.4011 2.44683L13.4011 6.44683C13.5984 7.23576 13.0017 8 12.1884 8H8.25H7.5V8.75V11.4854C7.5 11.5662 7.46101 11.6419 7.39531 11.6889L5.89531 12.7603ZM4 12.5569C4 13.9803 5.6089 14.8082 6.76717 13.9809L8.26717 12.9095C8.72706 12.581 9 12.0506 9 11.4854V9.5H12.1884C13.9775 9.5 15.2903 7.81868 14.8563 6.08303L13.8563 2.08303C13.5503 0.858816 12.4503 0 11.1884 0H0.75H0V0.75V8.75V9.5H0.75H3.75C3.88807 9.5 4 9.61193 4 9.75V12.5569Z"
        fill="currentColor"
      />
    </svg>
  )
}
