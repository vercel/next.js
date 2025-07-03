import { useCallback, useState, useRef } from 'react'
import { Menu } from '@base-ui-components/react/menu'
import type { SegmentNodeState } from '../../../userspace/app/segment-explorer-node'

export function SegmentBoundaryTrigger({
  onSelectBoundary,
  offset,
  boundaries,
}: {
  onSelectBoundary: SegmentNodeState['setBoundaryType']
  offset: number
  boundaries: Record<'not-found' | 'loading' | 'error', string | null>
}) {
  const [shadowRoot] = useState<ShadowRoot>(() => {
    const ownerDocument = document
    const portalNode = ownerDocument.querySelector('nextjs-portal')!
    return portalNode.shadowRoot! as ShadowRoot
  })
  const shadowRootRef = useRef<ShadowRoot>(shadowRoot)

  const triggerOptions = [
    {
      label: 'Trigger Loading',
      value: 'loading',
      icon: <LoadingIcon />,
      disabled: !boundaries.loading,
    },
    {
      label: 'Trigger Error',
      value: 'error',
      icon: <ErrorIcon />,
      disabled: !boundaries.error,
    },
    {
      label: 'Trigger Not Found',
      value: 'not-found',
      icon: <NotFoundIcon />,
      disabled: !boundaries['not-found'],
    },
  ]

  const resetOption = {
    label: 'Reset',
    value: 'reset',
    icon: <ResetIcon />,
  }

  const handleSelect = useCallback(
    (value: string) => {
      switch (value) {
        case 'not-found':
        case 'loading':
        case 'error':
          onSelectBoundary(value)
          break
        case 'reset':
          onSelectBoundary(null)
          break
        default:
          break
      }
    },
    [onSelectBoundary]
  )

  return (
    <div className="segment-boundary-trigger">
      <Menu.Root delay={0}>
        <Menu.Trigger
          className="segment-boundary-trigger-button"
          data-nextjs-dev-overlay-segment-boundary-trigger-button
          render={(triggerProps) => (
            <button {...triggerProps} type="button">
              <DropdownIcon />
            </button>
          )}
        />

        {/* @ts-expect-error remove this expect-error once shadowRoot is supported as container */}
        <Menu.Portal container={shadowRootRef}>
          <Menu.Positioner
            className="segment-boundary-dropdown-positioner"
            side="bottom"
            align="center"
            sideOffset={offset}
            arrowPadding={8}
          >
            <Menu.Popup className="segment-boundary-dropdown">
              {triggerOptions.map((option) => (
                <Menu.Item
                  key={option.value}
                  className="segment-boundary-dropdown-item"
                  onClick={() => handleSelect(option.value)}
                  disabled={option.disabled}
                >
                  {option.icon}
                  {option.label}
                </Menu.Item>
              ))}

              <div className="segment-boundary-dropdown-divider" />

              <Menu.Item
                key={resetOption.value}
                className="segment-boundary-dropdown-item"
                onClick={() => handleSelect(resetOption.value)}
              >
                {resetOption.icon}
                {resetOption.label}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  )
}

/**
 * Inline svg icons for the dropdown trigger.
 * The child svg icons like `rect` are fixed size, so they can be used as shared scalable icons.
 */
function DropdownIcon() {
  return (
    <svg
      width="20px"
      height="20px"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.5 6.5C3.32843 6.5 4 7.17157 4 8C4 8.82843 3.32843 9.5 2.5 9.5C1.67157 9.5 1 8.82843 1 8C1 7.17157 1.67157 6.5 2.5 6.5ZM8 6.5C8.82843 6.5 9.5 7.17157 9.5 8C9.5 8.82843 8.82843 9.5 8 9.5C7.17157 9.5 6.5 8.82843 6.5 8C6.5 7.17157 7.17157 6.5 8 6.5ZM13.5 6.5C14.3284 6.5 15 7.17157 15 8C15 8.82843 14.3284 9.5 13.5 9.5C12.6716 9.5 12 8.82843 12 8C12 7.17157 12.6716 6.5 13.5 6.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

function LoadingIcon() {
  return (
    <svg
      width="20px"
      height="20px"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_2759_1866)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10 3.5C13.5899 3.5 16.5 6.41015 16.5 10C16.5 13.5899 13.5899 16.5 10 16.5C6.41015 16.5 3.5 13.5899 3.5 10C3.5 6.41015 6.41015 3.5 10 3.5ZM2 10C2 14.4183 5.58172 18 10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10ZM10.75 9.62402V6H9.25V9.875C9.25 10.1898 9.39858 10.486 9.65039 10.6748L11.5498 12.0996L12.1504 12.5498L13.0498 11.3496L12.4502 10.9004L10.75 9.62402Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="clip0_2759_1866">
          <rect
            width="16"
            height="16"
            fill="white"
            transform="translate(2 2)"
          />
        </clipPath>
      </defs>
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_2759_1881)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3.5 7.30762V12.6924L7.30762 16.5H12.6924L16.5 12.6924V7.30762L12.6924 3.5H7.30762L3.5 7.30762ZM18 12.8994L17.9951 12.998C17.9724 13.2271 17.8712 13.4423 17.707 13.6064L13.6064 17.707L13.5332 17.7734C13.3806 17.8985 13.1944 17.9757 12.998 17.9951L12.8994 18H7.10059L7.00195 17.9951C6.80562 17.9757 6.6194 17.8985 6.4668 17.7734L6.39355 17.707L2.29297 13.6064C2.12883 13.4423 2.02756 13.2271 2.00488 12.998L2 12.8994V7.10059C2 6.83539 2.10546 6.58109 2.29297 6.39355L6.39355 2.29297C6.55771 2.12883 6.77294 2.02756 7.00195 2.00488L7.10059 2H12.8994L12.998 2.00488C13.2271 2.02756 13.4423 2.12883 13.6064 2.29297L17.707 6.39355C17.8945 6.58109 18 6.83539 18 7.10059V12.8994ZM9.25 5.75H10.75L10.75 10.75H9.25L9.25 5.75ZM10 14C10.5523 14 11 13.5523 11 13C11 12.4477 10.5523 12 10 12C9.44772 12 9 12.4477 9 13C9 13.5523 9.44772 14 10 14Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="clip0_2759_1881">
          <rect
            width="16"
            height="16"
            fill="white"
            transform="translate(2 2)"
          />
        </clipPath>
      </defs>
    </svg>
  )
}

function NotFoundIcon() {
  return (
    <svg
      width="20px"
      height="20px"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.5586 2.5C11.1341 2.50004 11.6588 2.8294 11.9091 3.34766L17.8076 15.5654C18.1278 16.2292 17.6442 16.9997 16.9072 17H3.09274C2.35574 16.9997 1.8721 16.2292 2.19235 15.5654L8.09079 3.34766C8.34109 2.8294 8.86583 2.50004 9.44137 2.5H10.5586ZM3.89059 15.5H16.1093L10.5586 4H9.44137L3.89059 15.5ZM9.24997 6.75H10.75L10.75 10.75H9.24997L9.24997 6.75ZM9.99997 14C10.5523 14 11 13.5523 11 13C11 12.4477 10.5523 12 9.99997 12C9.44768 12 8.99997 12.4477 8.99997 13C8.99997 13.5523 9.44768 14 9.99997 14Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.96484 3C13.8463 3.00018 17 6.13012 17 10C17 13.8699 13.8463 16.9998 9.96484 17C7.62404 17 5.54877 15.8617 4.27051 14.1123L3.82812 13.5068L5.03906 12.6221L5.48145 13.2275C6.48815 14.6053 8.12092 15.5 9.96484 15.5C13.0259 15.4998 15.5 13.0335 15.5 10C15.5 6.96654 13.0259 4.50018 9.96484 4.5C7.42905 4.5 5.29544 6.19429 4.63867 8.5H8V10H2.75C2.33579 10 2 9.66421 2 9.25V4H3.5V7.2373C4.57781 4.74376 7.06749 3 9.96484 3Z"
        fill="currentColor"
      />
    </svg>
  )
}

export const styles = `
  .segment-boundary-trigger {
    margin-left: auto;
    gap: 8px;
  }

  .segment-boundary-trigger-button {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    color: var(--color-gray-1000);
    border-radius: 6px;
    background: transparent;
    border: none;
  }

  .segment-boundary-trigger-button svg {
    width: 20px;
    height: 20px;
  }

  .segment-boundary-trigger-button:hover {
    background: var(--color-gray-400);
    color: var(--color-gray-1000);
  }

  .segment-boundary-dropdown {
    padding: 8px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-400);
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    min-width: 120px;
  }

  .segment-boundary-dropdown-positioner {
    z-index: 2147483648;
  }

  .segment-boundary-dropdown-item {
    display: flex;
    align-items: center;
    padding: 10px 8px;
    line-height: 20px;
    font-size: 14px;
    border-radius: 6px;
    color: var(--color-gray-1000);
    cursor: pointer;
    min-width: 220px;
    border: none;
    background: none;
    width: 100%;
  }

  .segment-boundary-dropdown-item[data-disabled] {
    color: var(--color-gray-400);
    cursor: not-allowed;
  }

  .segment-boundary-dropdown-item svg {
    margin-right: 12px;
    color: currentColor;
  }

  .segment-boundary-dropdown-item:hover {
    background: var(--color-gray-200);
  }

  .segment-boundary-dropdown-item:first-child {
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
  }

  .segment-boundary-dropdown-item:last-child {
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
  }

  .segment-boundary-dropdown-divider {
    height: 1px;
    background: var(--color-gray-400);
    margin: 8px 0;
  }
`
