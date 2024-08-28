import { CopyButton } from './copy-button'
import { isChromeDesktop } from '../../../../lib/is-chrome'

const isBrowserChromeDesktop = isChromeDesktop()

function NodeJsIcon(props: any) {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g clipPath="url(#clip0_1546_2)">
        <path
          d="M22 0L41.0526 11V33L22 44L2.94744 33V11L22 0Z"
          fill="#71BD55"
        />
        <path
          d="M41.0493 11.0001L41.0493 33L22 1.5583e-07L41.0493 11.0001Z"
          fill="#A1DF83"
        />
      </g>
      <defs>
        <clipPath id="clip0_1546_2">
          <rect width="44" height="44" fill="white" />
        </clipPath>
      </defs>
    </svg>
  )
}

function NodeJsDisabledIcon(props: any) {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M4.44744 11.866L22 1.73205L39.5526 11.866V32.134L22 42.2679L4.44744 32.134V11.866Z"
        fill="white"
        stroke="black"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M22 2L39 32"
        stroke="black"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function NodejsInspectorCopyButton({
  devtoolsFrontendUrl,
}: {
  devtoolsFrontendUrl: string | undefined
}) {
  const content = devtoolsFrontendUrl || ''
  const disabled = !content || !isBrowserChromeDesktop
  const Icon = disabled ? NodeJsDisabledIcon : NodeJsIcon
  return (
    <CopyButton
      data-nextjs-data-runtime-error-copy-devtools-url
      actionLabel={
        disabled
          ? 'Using Chrome inspector is only available in Chrome desktop and running with Node.js inspector'
          : 'Copy Chrome DevTools URL'
      }
      successLabel="Copied"
      content={content}
      icon={<Icon width={16} height={16} />}
      disabled={disabled}
    />
  )
}
