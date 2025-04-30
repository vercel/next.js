import { type CSSProperties, type Ref, forwardRef } from 'react'

export const Fader = forwardRef(function Fader(
  {
    stop,
    blur,
    side,
    style,
    height,
  }: {
    stop?: string
    blur?: string
    height?: number
    side: 'top' | 'bottom' | 'left' | 'right'
    className?: string
    style?: CSSProperties
  },
  ref: Ref<HTMLDivElement>
) {
  return (
    <div
      ref={ref}
      aria-hidden
      data-nextjs-scroll-fader
      className="nextjs-scroll-fader"
      data-side={side}
      style={
        {
          '--stop': stop,
          '--blur': blur,
          '--height': `${height}px`,
          ...style,
        } as React.CSSProperties
      }
    />
  )
})

export const FADER_STYLES = `
  .nextjs-scroll-fader {
    --blur: 1px;
    --stop: 25%;
    --height: 150px;
    --color-bg: var(--color-background-100);
    position: absolute;
    pointer-events: none;
    user-select: none;
    width: 100%;
    height: var(--height);
    left: 0;
    backdrop-filter: blur(var(--blur));

    &[data-side="top"] {
      top: 0;
      background: linear-gradient(to top, transparent, var(--color-bg));
      mask-image: linear-gradient(to bottom, var(--color-bg) var(--stop), transparent);
    }
  }
`
