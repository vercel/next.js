export function FileDependentIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      {...props}
    >
      <g clipPath="url(#file_dependent_icon_clip_path)">
        <path
          d="M6.05957 9C6.61177 9.0001 7.05957 9.44778 7.05957 10V15H5.55957V11.5615L1.06055 16.0605L0 15L4.5 10.5H1.06055V9H6.05957ZM9.18457 0.00488281C9.41351 0.0276056 9.62887 0.128866 9.79297 0.292969L14.207 4.70703C14.3945 4.89453 14.5 5.1489 14.5 5.41406V12L14.4873 12.2559C14.3677 13.4323 13.4323 14.3677 12.2559 14.4873L12 14.5H10V13H12C12.5523 13 13 12.5523 13 12V5.62109L8.87891 1.5H3V6H1.5V0H9.08594L9.18457 0.00488281Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="file_dependent_icon_clip_path">
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  )
}
