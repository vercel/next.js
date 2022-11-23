import {
  PropsWithRef,
  PropsWithoutRef,
  HTMLProps,
  CSSProperties,
  MouseEventHandler,
} from 'react'
import NextLink, { LinkProps } from 'next/link'

type NativeButtonProps = Omit<
  HTMLProps<HTMLAnchorElement>,
  'type' | 'prefix' | 'size' | 'width' | 'shape' | 'onClick'
>

export type ButtonVariant = 'shadow' | 'invert' | 'unstyled' | 'ghost'
export type ButtonAlignment = 'start' | 'grow' | 'center'

type BaseButtonProps = NativeButtonProps & {
  Component?: React.ElementType<any> // this could probably be better...
  typeName?: 'button' | 'submit' | 'reset'
  loading?: boolean
  suffix?: React.ReactNode
  prefix?: React.ReactNode
  size?: 'small' | 'large'
  variant?: ButtonVariant
  align?: ButtonAlignment
  svgOnly?: boolean
  passthroughOnClick?: MouseEventHandler
  passthroughOnMouseEnter?: MouseEventHandler
  onClick?: () => void
}

type PropsWithShape = BaseButtonProps &
  (
    | {
        width?: CSSProperties['width']
        shape?: never
      }
    | {
        shape?: 'square' | 'circle'
        width?: never
      }
  )

type PropsWithSvgOnly = PropsWithShape &
  (
    | {
        // If you're here, you probably got a TS error on the svgOnly prop
        // If you specify svgOnly, you MUST provide a descriptive label for the button
        svgOnly?: true
        'aria-label': string
      }
    | {
        svgOnly?: never
      }
  )

export type ButtonLinkProps = PropsWithRef<Omit<ButtonProps, 'href'>> &
  LinkProps & {
    tab?: boolean
  }

export const ButtonLink: React.FC<ButtonLinkProps> = ({
  href,
  as,
  shallow,
  children,
}) => {
  return (
    <NextLink
      href={href}
      as={as}
      shallow={shallow}
      // Always passHref to the <a> component if it's defined.
      passHref={!!href}
      legacyBehavior
    >
      <a>{children}</a>
    </NextLink>
  )
}

export type ButtonProps = PropsWithSvgOnly

const Visit = ({ onClick, ...props }: PropsWithoutRef<ButtonProps>) => {
  return (
    <ButtonLink href={'/test'} tab width={70} {...props}>
      Visit
    </ButtonLink>
  )
}

export default Visit
