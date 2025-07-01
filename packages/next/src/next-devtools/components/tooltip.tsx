import { forwardRef } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip'
import { cx } from '../dev-overlay/utils/cx'

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

export const styles = `
  .tooltip-wrapper {
    position: relative;
    display: inline-block;
    line-height: 1;
  }

  .tooltip {
    position: relative;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.4;
    min-width: 200px;
    pointer-events: none;
  }

  .tooltip-arrow {
    position: absolute;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: var(--arrow-size, 6px);
    border-color: transparent;
  }

  .tooltip-arrow--top {
    border-width: var(--arrow-size, 6px) var(--arrow-size, 6px) 0 var(--arrow-size, 6px);
    border-top-color: var(--tooltip-bg-color);
    bottom: 0;
    transform: translateY(100%);
  }

  .tooltip-arrow--bottom {
    border-width: 0 var(--arrow-size, 6px) var(--arrow-size, 6px) var(--arrow-size, 6px);
    border-bottom-color: var(--tooltip-bg-color);
    top: 0;
    transform: translateY(-100%);
  }

  .tooltip-arrow--left {
    border-width: var(--arrow-size, 6px) 0 var(--arrow-size, 6px) var(--arrow-size, 6px);
    border-left-color: var(--tooltip-bg-color);
    right: 0;
    transform: translateX(100%);
  }

  .tooltip-arrow--right {
    border-width: var(--arrow-size, 6px) var(--arrow-size, 6px) var(--arrow-size, 6px) 0;
    border-right-color: var(--tooltip-bg-color);
    left: 0;
    transform: translateX(-100%);
  }
  
  .tooltip-positioner {
    z-index: 3;
  }
`
