import * as React from 'react'

import { clsx } from '../helpers/clsx'

const defaultAttributes: React.SVGProps<SVGSVGElement> = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export interface IconProps
  extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  size?: string | number
}

export function BaseIcon({
  color = 'currentColor',
  size = 24,
  strokeWidth = 2,
  className,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }): React.ReactNode {
  return (
    <svg
      {...defaultAttributes}
      width={size}
      height={size}
      stroke={color}
      strokeWidth={strokeWidth}
      {...rest}
      className={clsx('icon', className)}
    >
      {children}
    </svg>
  )
}
