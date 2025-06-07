import { useRef } from 'react'
import { MENU_DURATION_MS, useClickOutside, useFocusTrap } from '../utils'
import { useDelayedRender } from '../../../../hooks/use-delayed-render'

export interface DevToolsInfoPropsCore {
  isOpen: boolean
  triggerRef: React.RefObject<HTMLButtonElement | null>
  close: () => void
}

export interface DevToolsInfoProps extends DevToolsInfoPropsCore {
  title: React.ReactNode
  children: React.ReactNode
  learnMoreLink?: string
}

export function DevToolsInfo({
  title,
  children,
  learnMoreLink,
  isOpen,
  triggerRef,
  close,
  ...props
}: DevToolsInfoProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  const { mounted, rendered } = useDelayedRender(isOpen, {
    // Intentionally no fade in, makes the UI feel more immediate
    enterDelay: 0,
    // Graceful fade out to confirm that the UI did not break
    exitDelay: MENU_DURATION_MS,
  })

  useFocusTrap(ref, triggerRef, isOpen, () => {
    // Bring focus to close button, so the user can easily close the overlay
    closeButtonRef.current?.focus()
  })
  useClickOutside(ref, triggerRef, isOpen, close)

  if (!mounted) {
    return null
  }

  return (
    <div
      tabIndex={-1}
      role="dialog"
      ref={ref}
      data-info-popover
      {...props}
      data-rendered={rendered}
    >
      <div className="dev-tools-info-container">
        <div className="dev-tools-info-header">
          <button
            ref={closeButtonRef}
            className="dev-tools-info-close-button"
            onClick={close}
            aria-label="Close dialog"
          >
            <IconChevronLeft />
          </button>
          <h3 className="dev-tools-info-title">{title}</h3>
        </div>
        <div className="dev-tools-info-body">
          {children}
          {learnMoreLink && (
            <div className="dev-tools-info-button-container">
              <a
                className="dev-tools-info-learn-more-button"
                href={learnMoreLink}
                target="_blank"
                rel="noreferrer noopener"
              >
                Learn More
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const DEV_TOOLS_INFO_STYLES = `
  [data-info-popover] {
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-400);
    background-clip: padding-box;
    box-shadow: var(--shadow-menu);
    border-radius: var(--rounded-xl);
    position: absolute;
    font-family: var(--font-stack-sans);
    z-index: 1000;
    overflow: hidden;
    opacity: 0;
    outline: 0;
    min-width: 350px;
    transition: opacity var(--animate-out-duration-ms)
      var(--animate-out-timing-function);

    &[data-rendered='true'] {
      opacity: 1;
      scale: 1;
    }

    button:focus-visible {
      outline: var(--focus-ring);
    }
  }

  .dev-tools-info-container {
    width: 100%;
  }

  .dev-tools-info-body {
    padding: 16px;
  }

  .dev-tools-info-header {
    height: 48px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-gray-alpha-400);
  }

  .dev-tools-info-close-button {
    all: unset;
    width: 20px;
    height: 20px;    
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-gray-900);
    transition: color 150ms ease;
    translate: 0 1px;
    border-radius: 3px;

    &:hover {
      color: var(--color-gray-1000);
    }
  }

  .dev-tools-info-title {
    color: var(--color-gray-1000);
    font-size: var(--size-14);
    font-weight: 500;
    line-height: var(--size-20);
    margin: 0;
  }

  .dev-tools-info-section-title {
    padding: 8px 0px;
    color: var(--color-gray-1000);
    font-size: var(--size-16);
    font-weight: 600;
    line-height: var(--size-20);
    margin: 0;
  }

  .dev-tools-info-article {
    padding: 8px 6px;
    color: var(--color-gray-1000);
    font-size: var(--size-14);
    line-height: var(--size-20);
    margin: 0;
  }
  .dev-tools-info-paragraph {
    &:last-child {
      margin-bottom: 0;
    }
  }

  .dev-tools-info-button-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .dev-tools-info-learn-more-button {
    align-content: center;
    padding: 0 8px;
    height: var(--size-28);
    font-size: var(--size-14);
    font-weight: 500;
    line-height: var(--size-20);
    transition: background var(--duration-short) ease;
    color: var(--color-background-100);
    border-radius: var(--rounded-md-2);
    background: var(--color-gray-1000);
    margin-left: auto;
  }

  .dev-tools-info-learn-more-button:hover {
    text-decoration: none;
    color: var(--color-background-100);
    opacity: 0.9;
  }
`

function IconChevronLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.14645 8.70703C4.75595 8.31651 4.75595 7.68349 5.14645 7.29297L10.5 1.93945L11.5605 3L6.56051 8L11.5605 13L10.5 14.0605L5.14645 8.70703Z"
        fill="currentColor"
      />
    </svg>
  )
}
