import { forwardRef } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip'
import { cx } from '../dev-overlay/utils/cx'
import './tooltip.css'

type TooltipDirection = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  children: React.ReactNode
  title: string
  direction?: TooltipDirection
  container?: HTMLElement | React.RefObject<HTMLElement>
  arrowSize?: number
  offset?: number
  bgcolor?: string
  color?: string
}

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  function Tooltip(
    {
      children,
      title,
      direction = 'top',
      container,
      arrowSize = 6,
      offset = 8,
      bgcolor = '#000',
      color = '#fff',
    },
    ref
  ) {
    return (
      <BaseTooltip.Provider>
        <BaseTooltip.Root delay={0}>
          <BaseTooltip.Trigger
            ref={ref}
            render={(triggerProps) => {
              return <span {...triggerProps}>{children}</span>
            }}
          />

          <BaseTooltip.Portal {...(container && { container })}>
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
                className="tooltip"
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
