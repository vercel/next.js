import { createConfig } from '@stitches/css'
import { createStyled } from '@stitches/styled'

const config = createConfig({
  tokens: {
    colors: {
      RED: 'tomato',
    },
  },
})
/*
  With Typescript:
  const { Provider, styled, useCss } = createStyled<typeof config>()  
*/
const { Provider, styled, useCss } = createStyled()

export { config, Provider, styled, useCss }
