import styled, { css } from 'styled-components'
const Button = styled.a`
  /* This renders the buttons above... Edit me! */
  display: inline-block;
  border-radius: 3px;
  padding: 0.5rem 0;
  margin: 0.5rem 1rem;
  width: 11rem;
  background: transparent;
  color: white;
  border: 2px solid white;

  /* The GitHub button is a primary button
   * edit this to target it specifically! */
  ${(props) =>
    props.$primary &&
    css`
      background: white;
      color: black;
    `}
`

export default function Home() {
  console.log('__render__')
  return (
    <div
      id="wrap-div"
      css={`
        background: black;
      `}
    >
      <Button
        href="https://github.com/styled-components/styled-components"
        target="_blank"
        rel="noopener"
        $primary
      >
        GitHub
      </Button>

      <Button id="btn" href="/docs">
        Documentation
      </Button>
    </div>
  )
}
