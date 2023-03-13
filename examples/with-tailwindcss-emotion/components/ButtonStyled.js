/* Example with @emotion/styled */
import styled from '@emotion/styled'
import xw, { cx } from 'xwind'

const Button = styled.button(xw`
  relative
  w-64 min-w-full
  flex justify-center
  py-2 px-4
  border border-transparent
  text-sm leading-5 font-medium
  rounded-md
  text-white
  bg-blue-600
  hover:bg-blue-500
  focus[outline-none ring-4 ring-blue-400]
  active:bg-blue-700
  transition duration-150 ease-in-out
`)

const IconWrapper = styled.span(xw`
  absolute left-0 inset-y-0
  flex items-center
  pl-3
`)

const Icon = styled.svg(xw`
  h-5 w-5
  text-blue-500
  group-hover:text-blue-400
  transition ease-in-out duration-150
`)

const ButtonStyled = ({ className, children, ...props }) => (
  <Button {...props} className={cx('group', className)}>
    <IconWrapper>
      <Icon fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
          clipRule="evenodd"
        />
      </Icon>
    </IconWrapper>
    {children}
  </Button>
)

export default ButtonStyled
