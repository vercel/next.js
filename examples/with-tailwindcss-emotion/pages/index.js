import { css } from '@emotion/css'
import tw from '@tailwindcssinjs/macro'
import ButtonCss from '../components/ButtonCss'
import ButtonReact from '../components/ButtonReact'
import ButtonStyled from '../components/ButtonStyled'

const Index = () => (
  <div className={css(tw`grid justify-center items-center h-screen`)}>
    <ButtonCss>@emotion/css</ButtonCss>
    <ButtonReact>@emotion/react</ButtonReact>
    <ButtonStyled>@emotion/styled</ButtonStyled>
  </div>
)

export default Index
