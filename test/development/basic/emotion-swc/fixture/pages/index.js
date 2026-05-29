import { css } from '@emotion/react'
import {
  Animated,
  Basic,
  bounce,
  Combined,
  Pink,
  BasicExtended,
  ComponentSelectorsExtended,
} from '../shared/styles'

const Home = () => (
  <div
    id={'test-element'}
    css={css`
      display: flex;
      flex-direction: column;
      background-color: pink;
    `}
  >
    <Basic>Cool Styles</Basic>
    <Pink>Pink text</Pink>
    <Combined>
      With <code>:hover</code>.
    </Combined>
    <Animated animation={bounce}>Let's bounce.</Animated>
    <ComponentSelectorsExtended>
      <BasicExtended>Nested</BasicExtended>
    </ComponentSelectorsExtended>
  </div>
)

export default Home
