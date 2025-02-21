import { CopyButton } from '../../copy-button'

// Inline this helper to avoid widely used across the codebase,
// as for this feature the Chrome detector doesn't need to be super accurate.
function isChrome() {
  if (typeof window === 'undefined') return false
  const isChromium = 'chrome' in window && window.chrome
  const vendorName = window.navigator.vendor

  return (
    isChromium !== null &&
    isChromium !== undefined &&
    vendorName === 'Google Inc.'
  )
}

const isChromeBrowser = isChrome()

function NodeJsIcon(props: any) {
  return (
    <svg
      width="14"
      height="14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <mask
        id="a"
        style={{ maskType: 'luminance' }}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="14"
        height="14"
      >
        <path
          d="M6.67.089 1.205 3.256a.663.663 0 0 0-.33.573v6.339c0 .237.126.455.33.574l5.466 3.17a.66.66 0 0 0 .66 0l5.465-3.17a.664.664 0 0 0 .329-.574V3.829a.663.663 0 0 0-.33-.573L7.33.089a.663.663 0 0 0-.661 0"
          fill="#fff"
        />
      </mask>
      <g mask="url(#a)">
        <path
          d="M18.648 2.717 3.248-4.86-4.648 11.31l15.4 7.58 7.896-16.174z"
          fill="url(#b)"
        />
      </g>
      <mask
        id="c"
        style={{ maskType: 'luminance' }}
        maskUnits="userSpaceOnUse"
        x="1"
        y="0"
        width="12"
        height="14"
      >
        <path
          d="M1.01 10.57a.663.663 0 0 0 .195.17l4.688 2.72.781.45a.66.66 0 0 0 .51.063l5.764-10.597a.653.653 0 0 0-.153-.122L9.216 1.18 7.325.087a.688.688 0 0 0-.171-.07L1.01 10.57z"
          fill="#fff"
        />
      </mask>
      <g mask="url(#c)">
        <path
          d="M-5.647 4.958 5.226 19.734l14.38-10.667L8.734-5.71-5.647 4.958z"
          fill="url(#d)"
        />
      </g>
      <g>
        <mask
          id="e"
          style={{ maskType: 'luminance' }}
          maskUnits="userSpaceOnUse"
          x="1"
          y="0"
          width="13"
          height="14"
        >
          <path
            d="M6.934.004A.665.665 0 0 0 6.67.09L1.22 3.247l5.877 10.746a.655.655 0 0 0 .235-.08l5.465-3.17a.665.665 0 0 0 .319-.453L7.126.015a.684.684 0 0 0-.189-.01"
            fill="#fff"
          />
        </mask>
        <g mask="url(#e)">
          <path d="M1.22.002v13.992h11.894V.002H1.22z" fill="url(#f)" />
        </g>
      </g>
      <defs>
        <linearGradient
          id="b"
          x1="10.943"
          y1="-1.084"
          x2="2.997"
          y2="15.062"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".3" stopColor="#3E863D" />
          <stop offset=".5" stopColor="#55934F" />
          <stop offset=".8" stopColor="#5AAD45" />
        </linearGradient>
        <linearGradient
          id="d"
          x1="-.145"
          y1="12.431"
          x2="14.277"
          y2="1.818"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".57" stopColor="#3E863D" />
          <stop offset=".72" stopColor="#619857" />
          <stop offset="1" stopColor="#76AC64" />
        </linearGradient>
        <linearGradient
          id="f"
          x1="1.225"
          y1="6.998"
          x2="13.116"
          y2="6.998"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".16" stopColor="#6BBF47" />
          <stop offset=".38" stopColor="#79B461" />
          <stop offset=".47" stopColor="#75AC64" />
          <stop offset=".7" stopColor="#659E5A" />
          <stop offset=".9" stopColor="#3E863D" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function NodeJsDisabledIcon(props: any) {
  return (
    <svg
      width="14"
      height="14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <mask
        id="a"
        style={{ maskType: 'luminance' }}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="14"
        height="14"
      >
        <path
          d="M6.67.089 1.205 3.256a.663.663 0 0 0-.33.573v6.339c0 .237.126.455.33.574l5.466 3.17a.66.66 0 0 0 .66 0l5.465-3.17a.664.664 0 0 0 .329-.574V3.829a.663.663 0 0 0-.33-.573L7.33.089a.663.663 0 0 0-.661 0"
          fill="#fff"
        />
      </mask>
      <g mask="url(#a)">
        <path
          d="M18.648 2.717 3.248-4.86-4.646 11.31l15.399 7.58 7.896-16.174z"
          fill="url(#b)"
        />
      </g>
      <mask
        id="c"
        style={{ maskType: 'luminance' }}
        maskUnits="userSpaceOnUse"
        x="1"
        y="0"
        width="12"
        height="15"
      >
        <path
          d="M1.01 10.571a.66.66 0 0 0 .195.172l4.688 2.718.781.451a.66.66 0 0 0 .51.063l5.764-10.597a.653.653 0 0 0-.153-.122L9.216 1.181 7.325.09a.688.688 0 0 0-.171-.07L1.01 10.572z"
          fill="#fff"
        />
      </mask>
      <g mask="url(#c)">
        <path
          d="M-5.647 4.96 5.226 19.736 19.606 9.07 8.734-5.707-5.647 4.96z"
          fill="url(#d)"
        />
      </g>
      <g>
        <mask
          id="e"
          style={{ maskType: 'luminance' }}
          maskUnits="userSpaceOnUse"
          x="1"
          y="0"
          width="13"
          height="14"
        >
          <path
            d="M6.935.003a.665.665 0 0 0-.264.085l-5.45 3.158 5.877 10.747a.653.653 0 0 0 .235-.082l5.465-3.17a.665.665 0 0 0 .319-.452L7.127.014a.684.684 0 0 0-.189-.01"
            fill="#fff"
          />
        </mask>
        <g mask="url(#e)">
          <path d="M1.222.001v13.992h11.893V0H1.222z" fill="url(#f)" />
        </g>
      </g>
      <defs>
        <linearGradient
          id="b"
          x1="10.944"
          y1="-1.084"
          x2="2.997"
          y2="15.062"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".3" stopColor="#676767" />
          <stop offset=".5" stopColor="#858585" />
          <stop offset=".8" stopColor="#989A98" />
        </linearGradient>
        <linearGradient
          id="d"
          x1="-.145"
          y1="12.433"
          x2="14.277"
          y2="1.819"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".57" stopColor="#747474" />
          <stop offset=".72" stopColor="#707070" />
          <stop offset="1" stopColor="#929292" />
        </linearGradient>
        <linearGradient
          id="f"
          x1="1.226"
          y1="6.997"
          x2="13.117"
          y2="6.997"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".16" stopColor="#878787" />
          <stop offset=".38" stopColor="#A9A9A9" />
          <stop offset=".47" stopColor="#A5A5A5" />
          <stop offset=".7" stopColor="#8F8F8F" />
          <stop offset=".9" stopColor="#626262" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const label =
  'Learn more about enabling Node.js inspector for server code with Chrome DevTools'

export function NodejsInspectorButton({
  devtoolsFrontendUrl,
}: {
  devtoolsFrontendUrl: string | undefined
}) {
  const content = devtoolsFrontendUrl || ''
  const disabled = !content || !isChromeBrowser
  if (disabled) {
    return (
      <a
        title={label}
        aria-label={label}
        className="nodejs-inspector-button"
        href={`https://nextjs.org/docs/app/building-your-application/configuring/debugging#server-side-code`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <NodeJsDisabledIcon
          className="error-overlay-toolbar-button-icon"
          width={14}
          height={14}
        />
      </a>
    )
  }
  return (
    <CopyButton
      data-nextjs-data-runtime-error-copy-devtools-url
      className="nodejs-inspector-button"
      actionLabel={'Copy Chrome DevTools URL'}
      successLabel="Copied"
      content={content}
      icon={
        <NodeJsIcon
          className="error-overlay-toolbar-button-icon"
          width={14}
          height={14}
        />
      }
    />
  )
}
