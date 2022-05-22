import styled from 'styled-components'
import tw from 'twin.macro'

// For index.ts

export const Container = styled.div`
  ${tw`
flex flex-col items-center justify-center min-h-screen py-2
`};
`

export const Main = styled.main`
  ${tw`
flex flex-col items-center justify-center w-full flex-1 px-20 text-center
`};
`

export const Title = styled.h1`
  ${tw`
text-6xl font-bold
`};
`

export const TitleLink = styled.a`
  ${tw`
text-blue-600
`};
`

export const Description = styled.p`
  ${tw`
mt-3 text-2xl
`};
`

export const Code = styled.code`
  ${tw`
p-3 font-mono text-lg bg-gray-100 rounded-md
`};
`

export const Grid = styled.div`
  ${tw`
flex flex-wrap items-center justify-around max-w-4xl mt-6 sm:w-full
`};
`

export const Card = styled.a`
  ${tw`
p-6 mt-6 text-left border w-96 rounded-xl hover:text-blue-600 focus:text-blue-600
`};
`

export const CardTitle = styled.h3`
  ${tw`
text-2xl font-bold
`};
`

export const CardDetail = styled.p`
  ${tw`
mt-4 text-xl
`};
`

export const Footer = styled.footer`
  ${tw`
flex items-center justify-center w-full h-24 border-t
`};
`

export const FooterLink = styled.a`
  ${tw`
flex items-center justify-center
`};
`

export const FooterImage = styled.img`
  ${tw`
h-4 ml-2
`};
`
