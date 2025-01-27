export function RightArrow({
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
        d="M9.53033 2.21978L9 1.68945L7.93934 2.75011L8.46967 3.28044L12.4393 7.25011H1.75H1V8.75011H1.75H12.4393L8.46967 12.7198L7.93934 13.2501L9 14.3108L9.53033 13.7804L14.6036 8.70722C14.9941 8.3167 14.9941 7.68353 14.6036 7.29301L9.53033 2.21978Z"
        fill="currentColor"
      />
    </svg>
  )
}
