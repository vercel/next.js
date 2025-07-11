import { forwardRef, useRef, useState } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip'
import { cx } from '../dev-overlay/utils/cx'
import './tooltip.css'

type TooltipDirection = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  children: React.ReactNode
  title: string | null
  direction?: TooltipDirection
  arrowSize?: number
  offset?: number
  bgcolor?: string
  color?: string
  className?: string
}

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  function Tooltip(
    {
      className,
      children,
      title,
      direction = 'top',
      arrowSize = 6,
      offset = 8,
      bgcolor = '#000',
      color = '#fff',
    },
    ref
  ) {
    const [shadowRoot] = useState<ShadowRoot>(() => {
      const ownerDocument = document
      const portalNode = ownerDocument.querySelector('nextjs-portal')!
      return portalNode.shadowRoot! as ShadowRoot
    })
    const shadowRootRef = useRef<ShadowRoot>(shadowRoot)
    if (!title) {
      return children
    }
    return (
      <BaseTooltip.Provider>
        <BaseTooltip.Root delay={400}>
          <BaseTooltip.Trigger
            ref={ref}
            render={(triggerProps) => {
              return <span {...triggerProps}>{children}</span>
            }}
          />

          {/* x-ref: https://github.com/mui/base-ui/issues/2224 */}
          {/* @ts-expect-error remove this expect-error once shadowRoot is supported as container */}
          <BaseTooltip.Portal container={shadowRootRef}>
            <BaseTooltip.Positioner
              side={direction}
              sideOffset={offset + arrowSize}
              className="tooltip-positioner"
              style={
                {
                  '--anchor-width': `${arrowSize}px`,
                  '--anchor-height': `${arrowSize}px`,
                } as React.CSSProperties
              }
            >
              <BaseTooltip.Popup
                className={cx('tooltip', className)}
                style={
                  {
                    backgroundColor: bgcolor,
                    color: color,
                    '--tooltip-bg-color': bgcolor,
                    '--arrow-size': `${arrowSize}px`,
                  } as React.CSSProperties
                }
              >
                {title}
                <BaseTooltip.Arrow
                  className={cx('tooltip-arrow', `tooltip-arrow--${direction}`)}
                  style={
                    {
                      '--arrow-size': `${arrowSize}px`,
                      '--tooltip-bg-color': bgcolor,
                    } as React.CSSProperties
                  }
                />
              </BaseTooltip.Popup>
            </BaseTooltip.Positioner>
          </BaseTooltip.Portal>
        </BaseTooltip.Root>
      </BaseTooltip.Provider>
    )
  }
)
