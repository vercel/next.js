import { SVGProps, ReactNode } from 'react'

const defaultAttributes: Partial<SVGProps<SVGSVGElement>> = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export interface IconProps extends Partial<SVGProps<SVGSVGElement>> {
  size?: string | number
}

export const BaseIcon = ({
  color = 'currentColor',
  size = 24,
  strokeWidth = 2,
  ...rest
}: IconProps & { children: ReactNode }) => {
  return (
    <svg
      {...defaultAttributes}
      width={size}
      height={size}
      stroke={color}
      strokeWidth={strokeWidth}
      {...rest}
    />
  )
}
