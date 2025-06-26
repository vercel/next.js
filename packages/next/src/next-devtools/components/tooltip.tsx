import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type TooltipDirection = 'top' | 'bottom' | 'left' | 'right'

export function Tooltip({
  children,
  title,
  direction,
  container,
  arrowSize = 6,
  offset = 0,
  bgcolor = '#000',
  color = '#fff',
}: {
  children: React.ReactNode
  title: string
  direction: TooltipDirection
  container?: HTMLElement | ShadowRoot
  arrowSize?: number
  offset?: number
  bgcolor?: string
  color?: string
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const wrapperRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (isVisible && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect()
      let top = rect.top
      let left = rect.left

      const arrowOffset = arrowSize * 2
      switch (direction) {
        case 'top':
          top = rect.top - offset - arrowOffset
          left = rect.left + rect.width / 2
          break
        case 'bottom':
          top = rect.bottom + offset + arrowOffset
          left = rect.left + rect.width / 2
          break
        case 'left':
          top = rect.top + rect.height / 2
          left = rect.left - offset - arrowOffset
          break
        case 'right':
          top = rect.top + rect.height / 2
          left = rect.right + offset + arrowOffset
          break
        default:
          break
      }

      setPosition({ top, left })
    }
  }, [isVisible, direction, offset, arrowSize])

  const handleMouseEnter = () => {
    setIsVisible(true)
  }

  const handleMouseLeave = () => {
    setIsVisible(false)
  }

  // Generate dynamic arrow styles based on arrowSize prop
  const getArrowStyles = () => {
    const baseStyles = {
      position: 'absolute' as const,
      width: 0,
      height: 0,
      borderStyle: 'solid' as const,
    }

    switch (direction) {
      case 'top':
        return {
          ...baseStyles,
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: `${arrowSize}px ${arrowSize}px 0 ${arrowSize}px`,
        }
      case 'bottom':
        return {
          ...baseStyles,
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: `0 ${arrowSize}px ${arrowSize}px ${arrowSize}px`,
        }
      case 'left':
        return {
          ...baseStyles,
          left: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          borderWidth: `${arrowSize}px 0 ${arrowSize}px ${arrowSize}px`,
        }
      case 'right':
        return {
          ...baseStyles,
          right: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          borderWidth: `${arrowSize}px ${arrowSize}px ${arrowSize}px 0`,
        }
      default:
        return baseStyles
    }
  }

  const tooltip = isVisible ? (
    <div
      className="tooltip-portal"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: wrapperRef.current?.offsetWidth || 0,
        height: wrapperRef.current?.offsetHeight || 0,
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      <div
        className="tooltip"
        data-direction={direction}
        style={
          {
            transform:
              direction === 'top' || direction === 'bottom'
                ? 'translate(-50%, ' +
                  (direction === 'top' ? '-100%' : '0%') +
                  ')'
                : direction === 'left'
                  ? 'translate(-100%, -50%)'
                  : 'translate(0%, -50%)',
            backgroundColor: bgcolor,
            '--tooltip-bg-color': bgcolor,
            '--tooltip-color': color,
          } as React.CSSProperties
        }
      >
        {title}
        <div style={getArrowStyles()} className="tooltip-arrow" />
      </div>
    </div>
  ) : null

  return (
    <>
      <span
        ref={wrapperRef}
        className="tooltip-wrapper"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </span>
      {typeof document !== 'undefined' &&
        tooltip &&
        createPortal(tooltip, container || document.body)}
    </>
  )
}

export const styles = `
  .tooltip-wrapper {
    position: relative;
    display: inline-block;
    line-height: 1;
  }

  .tooltip {
    position: relative;
    background: var(--tooltip-bg-color);
    color: var(--tooltip-color);
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.4;
    white-space: nowrap;
    min-width: 200px;
    white-space: normal;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    pointer-events: none;
  }
  
  .tooltip-arrow {
    border-color: transparent;
  }
  [data-direction="top"] .tooltip-arrow {
    border-top-color: var(--tooltip-bg-color);
  }
  [data-direction="bottom"] .tooltip-arrow {
    border-bottom-color: var(--tooltip-bg-color);
  }
  [data-direction="left"] .tooltip-arrow {
    border-left-color: var(--tooltip-bg-color);
  }
  [data-direction="right"] .tooltip-arrow {
    border-right-color: var(--tooltip-bg-color);
  }
`
