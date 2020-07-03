/**
 * styled-components v5 currently has unexpected style outputs for production builds.
 * More on that here: https://github.com/styled-components/styled-components/issues/3026
 *
 * Before updating styled-components to v5, make sure that this page outputs the same
 * results for both `npm run dev` and `npm run build && npm run start`. Otherwise you
 * may risk getting broken styles to the production app.
 */

import styled, { css } from 'styled-components'

const Base = styled.div`
  cursor: pointer;
  touch-action: none;
`

function composeButton(css) {
  const Root = styled(Base)`
    ${css};
  `

  return function ComposeButton(props) {
    return <Root {...props}>Compose</Root>
  }
}

const ComposeButton1 = composeButton(
  css`
    user-select: none;
    transform: translateX(-3px);
    display: inline-block;
    padding: 12px 20px;
    border: 1px solid #dcdcdc;
    background-color: #fff;
    border-radius: 40px;
    color: #222;
    font-size: 16px;
    line-height: 1.75;
    letter-spacing: 0.2px;
  `
)

const ComposeButton2 = composeButton(
  css`
    display: block;
    height: 36px;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: bold;
    height: 31px;
    width: 36px;
    position: relative;
    color: #025aa5;
  `
)

export default function Page() {
  return (
    <div>
      <ComposeButton1 />
      <ComposeButton2 />
    </div>
  )
}
