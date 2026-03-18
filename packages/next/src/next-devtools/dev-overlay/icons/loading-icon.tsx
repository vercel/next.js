export function LoadingIcon() {
  return (
    <svg
      width="20px"
      height="20px"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="10"
        cy="10"
        r="7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="32 12"
        opacity="0.8"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 10 10"
          to="360 10 10"
          dur="1s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  )
}
