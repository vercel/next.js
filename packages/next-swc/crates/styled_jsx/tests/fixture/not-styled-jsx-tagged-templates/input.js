import css from 'hell'

const color = 'red'

const bar = css`
  div {
    font-size: 3em;
  }
`
export const uh = bar

export const foo = css`div { color: ${color}}`

export default css`
  div {
    font-size: 3em;
  }
  p {
    color: ${color};
  }
`

const Title = styled.h1`
  color: red;
  font-size: 50px;
`

const AnotherTitle = Title.extend`color: blue;`

export const Component = () => <AnotherTitle>My page</AnotherTitle>
