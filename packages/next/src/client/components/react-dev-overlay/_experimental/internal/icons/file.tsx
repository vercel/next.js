export function FileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="17"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.5 7v7a2.5 2.5 0 0 1-2.5 2.5H4A2.5 2.5 0 0 1 1.5 14V.5h7.586a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 .293.707V7zM13 7v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2h5v5h5zM9.5 2.621V5.5h2.879L9.5 2.621z"
        fill="currentColor"
      />
    </svg>
  )
}
