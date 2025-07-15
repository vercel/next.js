import {
  NEXTJS_HYDRATION_ERROR_LINK,
  REACT_HYDRATION_ERROR_LINK,
} from '../../../../shared/react-19-hydration-error'
import { parseUrlFromText } from '../../../utils/parse-url-from-text'

const docsURLAllowlist = ['https://nextjs.org', 'https://react.dev']

function docsLinkMatcher(text: string): boolean {
  return docsURLAllowlist.some((url) => text.startsWith(url))
}

function getDocsURLFromErrorMessage(text: string): string | null {
  const urls = parseUrlFromText(text, docsLinkMatcher)

  if (urls.length === 0) {
    return null
  }

  const href = urls[0]

  // Replace react hydration error link with nextjs hydration error link
  if (href === REACT_HYDRATION_ERROR_LINK) {
    return NEXTJS_HYDRATION_ERROR_LINK
  }

  return href
}

export function DocsLinkButton({ errorMessage }: { errorMessage: string }) {
  const docsURL = getDocsURLFromErrorMessage(errorMessage)

  if (!docsURL) {
    return (
      <button
        title="No related documentation found"
        aria-label="No related documentation found"
        className="docs-link-button"
        disabled
      >
        <DocsIcon
          className="error-overlay-toolbar-button-icon"
          width={14}
          height={14}
        />
      </button>
    )
  }

  return (
    <a
      title="Go to related documentation"
      aria-label="Go to related documentation"
      className="docs-link-button"
      href={docsURL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <DocsIcon
        className="error-overlay-toolbar-button-icon"
        width={14}
        height={14}
      />
    </a>
  )
}

function DocsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 .875h4.375C5.448.875 6.401 1.39 7 2.187A3.276 3.276 0 0 1 9.625.875H14v11.156H9.4c-.522 0-1.023.208-1.392.577l-.544.543h-.928l-.544-.543c-.369-.37-.87-.577-1.392-.577H0V.875zm6.344 3.281a1.969 1.969 0 0 0-1.969-1.968H1.312v8.53H4.6c.622 0 1.225.177 1.744.502V4.156zm1.312 7.064V4.156c0-1.087.882-1.968 1.969-1.968h3.063v8.53H9.4c-.622 0-1.225.177-1.744.502z"
        fill="currentColor"
      />
    </svg>
  )
}
