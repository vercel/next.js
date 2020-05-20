import { styled } from '../css'

const Header = styled.h1((css) => css.color('RED'))

export default function Home() {
  return <Header>Hello world</Header>
}
