export function LeftArrow({
  title,
  className,
}: {
  title?: string
  className?: string
}) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.46963 13.7804L6.99996 14.3108L8.06062 13.2501L7.53029 12.7198L3.56062 8.75011H14.25H15V7.25011H14.25H3.56062L7.53029 3.28044L8.06062 2.75011L6.99996 1.68945L6.46963 2.21978L1.39641 7.29301C1.00588 7.68353 1.00588 8.3167 1.39641 8.70722L6.46963 13.7804Z"
        fill="currentColor"
      />
    </svg>
  )
}
