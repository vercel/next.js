import { styled } from 'goober'

const Title = styled('h1')`
  padding: 0;
  margin: 0;
  color: tomato;
`

const SmallTitle = styled('p')`
  font-size: 1em;
  color: dodgerblue;
  transition: padding 200ms ease-in-out;
  padding: 1em;

  &:hover {
    padding-left: 2em;
    color: darkseagreen;
  }
`

export default function Home() {
  return (
    <>
      <Title>You are using 🥜 goober! Yay!</Title>
      <SmallTitle>Go on, try it!</SmallTitle>
    </>
  )
}
