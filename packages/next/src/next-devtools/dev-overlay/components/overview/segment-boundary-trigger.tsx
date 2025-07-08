import { useCallback, useState, useRef, useMemo } from 'react'
import { Menu } from '@base-ui-components/react/menu'
import type { SegmentNodeState } from '../../../userspace/app/segment-explorer-node'
import { ChevronDownIcon } from '../../icons/chevron-down'
import {
  isBoundaryFile,
  normalizeBoundaryFilename,
} from '../../../../server/app-render/segment-explorer-path'
import { cx } from '../../utils/cx'
import { useClickOutside } from '../errors/dev-tools-indicator/utils'

const composeRefs = (...refs: (React.Ref<HTMLButtonElement> | undefined)[]) => {
  return (node: HTMLButtonElement | null) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    })
  }
}

export function SegmentBoundaryTrigger({
  onSelectBoundary,
  offset,
  boundaries,
  pagePath,
  fileType,
  boundaryType,
}: {
  onSelectBoundary: SegmentNodeState['setBoundaryType']
  offset: number
  boundaries: Record<'not-found' | 'loading' | 'error', string | null>
  fileType: string
  pagePath: string
  boundaryType: string | null
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [shadowRoot] = useState<ShadowRoot>(() => {
    const ownerDocument = document
    const portalNode = ownerDocument.querySelector('nextjs-portal')!
    return portalNode.shadowRoot! as ShadowRoot
  })
  const shadowRootRef = useRef<ShadowRoot>(shadowRoot)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Click outside of popup should close the menu
  useClickOutside(
    popupRef,
    triggerRef,
    isOpen,
    () => {
      setIsOpen(false)
    },
    triggerRef.current?.ownerDocument
  )

  const firstDefinedBoundary = Object.values(boundaries).find((v) => v !== null)
  const possibleExtension = firstDefinedBoundary
    ? firstDefinedBoundary.split('.')?.pop()
    : 'js'

  const fileNames = useMemo(() => {
    return Object.fromEntries(
      Object.entries(boundaries).map(([key, value]) => {
        const fileName = normalizeBoundaryFilename(
          value || `${key}.${possibleExtension}`
        )
        return [key, fileName]
      })
    ) as Record<keyof typeof boundaries, string>
  }, [boundaries, possibleExtension])

  const fileName = (pagePath || '').split('/').pop() || ''
  const isBoundary = isBoundaryFile(fileType)
  const pageFileName = normalizeBoundaryFilename(
    isBoundary
      ? fileName // Show the selected boundary file name when overridden
      : fileName || `page.${possibleExtension}`
  )

  const triggerOptions = [
    {
      label: fileNames.loading,
      value: 'loading',
      icon: <LoadingIcon />,
      disabled: !boundaries.loading,
    },
    {
      label: fileNames.error,
      value: 'error',
      icon: <ErrorIcon />,
      disabled: !boundaries.error,
    },
    {
      label: fileNames['not-found'],
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

  const openInEditorOption = pagePath
    ? {
        label: 'Open in Editor',
        value: 'open-editor',
        icon: <EditorIcon />,
      }
    : null

  // Check if there are any boundaries available
  const hasBoundaries = Object.values(boundaries).some(
    (boundary) => boundary !== null
  )
  const isPageOrBoundary = fileType && !isBoundaryFile(fileType)

  const openInEditor = useCallback(({ filePath }: { filePath: string }) => {
    const params = new URLSearchParams({
      file: filePath,
      isAppRelativePath: '1',
    })
    fetch(
      `${
        process.env.__NEXT_ROUTER_BASEPATH || ''
      }/__nextjs_launch-editor?${params.toString()}`
    )
  }, [])

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
        case 'open-editor':
          if (pagePath) {
            openInEditor({ filePath: pagePath })
          }
          break
        default:
          break
      }
    },
    [onSelectBoundary, pagePath, openInEditor]
  )

  // For non-page files, just render a simple button to open in editor
  if (
    !(fileType === 'page' || fileType === 'default') &&
    !isBoundaryFile(fileType)
  ) {
    return (
      <button
        className="segment-boundary-trigger"
        onClick={() => pagePath && openInEditor({ filePath: pagePath })}
        type="button"
      >
        <span className="segment-boundary-trigger-text">
          {pageFileName || fileType}
        </span>
      </button>
    )
  }

  const Trigger = (
    triggerProps: React.ComponentProps<'button'> & {
      ref?: React.Ref<HTMLButtonElement>
    }
  ) => {
    const mergedRef = composeRefs(triggerProps.ref, triggerRef)

    return (
      <button {...triggerProps} ref={mergedRef} type="button">
        <span className="segment-boundary-trigger-text">
          {isPageOrBoundary
            ? pageFileName
            : boundaryType === null
              ? // TODO(pran): improve the UX of the default boundary selector
                'boundary'
              : pageFileName}
        </span>
        <ChevronDownIcon />
      </button>
    )
  }

  const isOverridden = boundaryType !== null

  return (
    <Menu.Root delay={0} modal={false} open={isOpen} onOpenChange={setIsOpen}>
      <Menu.Trigger
        className={cx(
          'segment-boundary-trigger',
          !isPageOrBoundary && 'segment-boundary-trigger--boundary',
          isOverridden && 'segment-boundary-trigger--overridden'
        )}
        data-nextjs-dev-overlay-segment-boundary-trigger-button
        render={Trigger}
      />

      {/* @ts-expect-error remove this expect-error once shadowRoot is supported as container */}
      <Menu.Portal container={shadowRootRef}>
        <Menu.Positioner
          className="segment-boundary-dropdown-positioner"
          side="bottom"
          align="center"
          sideOffset={offset}
          arrowPadding={8}
          ref={popupRef}
        >
          <Menu.Popup className="segment-boundary-dropdown">
            {hasBoundaries && (
              <Menu.Group>
                <Menu.GroupLabel className="segment-boundary-group-label">
                  Trigger overrides
                </Menu.GroupLabel>
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
              </Menu.Group>
            )}

            <Menu.Group>
              {hasBoundaries && (
                <Menu.Item
                  key={resetOption.value}
                  className="segment-boundary-dropdown-item"
                  onClick={() => handleSelect(resetOption.value)}
                >
                  {resetOption.icon}
                  {resetOption.label}
                </Menu.Item>
              )}
              {openInEditorOption && (
                <Menu.Item
                  key={openInEditorOption.value}
                  className="segment-boundary-dropdown-item"
                  onClick={() => handleSelect(openInEditorOption.value)}
                >
                  {openInEditorOption.icon}
                  {openInEditorOption.label}
                </Menu.Item>
              )}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
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

function EditorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12.409 3.45361L12.2274 4.18115L9.22737 16.1821L9.04475 16.9097L7.59065 16.5454L7.77229 15.8179L10.7723 3.81787L10.9539 3.09033L12.409 3.45361ZM6.81038 6.99951L3.81038 9.99951L6.81038 12.9995L5.74983 14.0601L2.39632 10.7065C2.00596 10.316 2.00587 9.68295 2.39632 9.29248L5.74983 5.93896L6.81038 6.99951ZM17.6033 9.29248C17.9938 9.68294 17.9937 10.316 17.6033 10.7065L14.2498 14.0601L13.1893 12.9995L16.1893 9.99951L13.1893 6.99951L14.2498 5.93896L17.6033 9.29248Z" />
    </svg>
  )
}

export const styles = `
  .segment-boundary-trigger {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    line-height: 16px;
    font-weight: 500;
    color: var(--color-gray-1000);
    border-radius: 6px;
    background: var(--color-gray-300);
    border: none;
    font-size: var(--size-12);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .segment-boundary-trigger-text {
    font-size: var(--size-12);
    font-weight: 500;
    user-select: none;
  }

  .segment-boundary-trigger svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .segment-boundary-trigger:hover {
    background: var(--color-gray-400);
  }

  .segment-boundary-trigger--boundary {
    background: white;
    box-shadow: inset 0 0 0 1px var(--color-gray-400);
  }

  .segment-boundary-trigger--boundary:hover {
    background: var(--color-gray-200);
  }

  .segment-boundary-trigger--overridden {
    background: var(--color-amber-300);
    color: var(--color-amber-900);
  }

  .segment-boundary-dropdown {
    padding: 8px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-400);
    border-radius: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    min-width: 120px;
  }

  .segment-boundary-dropdown-positioner {
    z-index: 2147483648;
  }

  .segment-boundary-dropdown-item {
    display: flex;
    align-items: center;
    padding: 8px;
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

  .segment-boundary-group-label {
    padding: 8px;
    font-size: 13px;
    line-height: 16px;
    font-weight: 400;
    color: var(--color-gray-900);
  }
`
