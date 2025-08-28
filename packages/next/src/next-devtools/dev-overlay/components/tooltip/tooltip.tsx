import { forwardRef } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { cx } from '../../utils/cx'
import './tooltip.css'

type TooltipDirection = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  children: React.ReactNode
  title: string | null
  direction?: TooltipDirection
  arrowSize?: number
  offset?: number
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
    },
    ref
  ) {
    const { shadowRoot } = useDevOverlayContext()
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

          <BaseTooltip.Portal container={shadowRoot}>
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
