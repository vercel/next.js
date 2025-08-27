import './segment-boundary-trigger.css'
import { useCallback, useState, useRef, useMemo } from 'react'
import { Menu } from '@base-ui-components/react/menu'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import type {
  SegmentBoundaryType,
  SegmentNodeState,
} from '../../../userspace/app/segment-explorer-node'
import { normalizeBoundaryFilename } from '../../../../server/app-render/segment-explorer-path'
import { useClickOutsideAndEscape } from '../errors/dev-tools-indicator/utils'

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
  nodeState,
  boundaries,
}: {
  nodeState: SegmentNodeState
  boundaries: Record<SegmentBoundaryType, string | null>
}) {
  const currNode = nodeState
  const { pagePath, boundaryType, setBoundaryType: onSelectBoundary } = currNode

  const [isOpen, setIsOpen] = useState(false)
  const { shadowRoot } = useDevOverlayContext()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Click outside of popup should close the menu
  useClickOutsideAndEscape(
    popupRef,
    triggerRef,
    isOpen,
    () => {
      setIsOpen(false)
    },
    // eslint-disable-next-line react-hooks/refs -- TODO
    triggerRef.current?.ownerDocument
  )

  const firstDefinedBoundary = Object.values(boundaries).find((v) => v !== null)
  const possibleExtension =
    (firstDefinedBoundary || '').split('.').pop() || 'js'

  const fileNames = useMemo(() => {
    return Object.fromEntries(
      Object.entries(boundaries).map(([key, filePath]) => {
        const fileName = normalizeBoundaryFilename(
          (filePath || '').split('/').pop() || `${key}.${possibleExtension}`
        )
        return [key, fileName]
      })
    ) as Record<keyof typeof boundaries, string>
  }, [boundaries, possibleExtension])

  const fileName = (pagePath || '').split('/').pop() || ''
  const pageFileName = normalizeBoundaryFilename(
    boundaryType
      ? `page.${possibleExtension}`
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
    label: boundaryType ? 'Reset' : pageFileName,
    value: 'reset',
    icon: <ResetIcon />,
    disabled: boundaryType === null,
  }

  const openInEditor = useCallback(({ filePath }: { filePath: string }) => {
    const params = new URLSearchParams({
      file: filePath,
      isAppRelativePath: '1',
    })
    fetch(
      `${
        process.env.__NEXT_ROUTER_BASEPATH || ''
      }/__nextjs_launch-editor?${params.toString()}`
      // Log the failures to console, not track them as console errors in error overlay
    ).catch(console.warn)
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

  const MergedRefTrigger = (
    triggerProps: React.ComponentProps<'button'> & {
      ref?: React.Ref<HTMLButtonElement>
    }
  ) => {
    const mergedRef = composeRefs(triggerProps.ref, triggerRef)
    return <Trigger {...triggerProps} ref={mergedRef} />
  }

  const hasBoundary = useMemo(() => {
    const hasPageOrBoundary =
      nodeState.type !== 'layout' && nodeState.type !== 'template'
    return (
      hasPageOrBoundary && Object.values(boundaries).some((v) => v !== null)
    )
  }, [nodeState.type, boundaries])

  return (
    <Menu.Root delay={0} modal={false} open={isOpen} onOpenChange={setIsOpen}>
      <Menu.Trigger
        className="segment-boundary-trigger"
        data-nextjs-dev-overlay-segment-boundary-trigger-button
        render={MergedRefTrigger}
        disabled={!hasBoundary}
      />

      <Menu.Portal container={shadowRoot}>
        <Menu.Positioner
          className="segment-boundary-dropdown-positioner"
          side="bottom"
          align="center"
          sideOffset={6}
          arrowPadding={8}
          ref={popupRef}
        >
          <Menu.Popup className="segment-boundary-dropdown">
            {
              <Menu.Group>
                <Menu.GroupLabel className="segment-boundary-group-label">
                  Toggle Overrides
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
            }

            <Menu.Group>
              {
                <Menu.Item
                  key={resetOption.value}
                  className="segment-boundary-dropdown-item"
                  onClick={() => handleSelect(resetOption.value)}
                  disabled={resetOption.disabled}
                >
                  {resetOption.icon}
                  {resetOption.label}
                </Menu.Item>
              }
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

function SwitchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg strokeLinejoin="round" viewBox="0 0 16 16" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.7071 2.39644C8.31658 2.00592 7.68341 2.00592 7.29289 2.39644L4.46966 5.21966L3.93933 5.74999L4.99999 6.81065L5.53032 6.28032L7.99999 3.81065L10.4697 6.28032L11 6.81065L12.0607 5.74999L11.5303 5.21966L8.7071 2.39644ZM5.53032 9.71966L4.99999 9.18933L3.93933 10.25L4.46966 10.7803L7.29289 13.6035C7.68341 13.9941 8.31658 13.9941 8.7071 13.6035L11.5303 10.7803L12.0607 10.25L11 9.18933L10.4697 9.71966L7.99999 12.1893L5.53032 9.71966Z"
        fill="currentColor"
      ></path>
    </svg>
  )
}

function Trigger(props: React.ComponentProps<'button'>) {
  return (
    <button {...props}>
      <span className="segment-boundary-trigger-text">
        <SwitchIcon className="plus-icon" />
      </span>
    </button>
  )
}
