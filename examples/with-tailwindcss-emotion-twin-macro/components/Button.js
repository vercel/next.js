import tw, { styled } from 'twin.macro'

const Button = styled.button(({ variant }) => [
  tw`px-4 py-2 transform duration-200 rounded bg-black text-white font-medium border-2 border-transparent whitespace-nowrap`,
  tw`focus:(outline-none ring-2 ring-pink-500 ring-opacity-50)`,
  tw`hover:(scale-[1.02] shadow-lg)`,
  tw`active:scale-100`,
  variant === 'hollow' &&
    tw`bg-white text-black border-current border-opacity-50`,
])

export default Button
