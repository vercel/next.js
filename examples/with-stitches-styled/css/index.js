import { createCss } from '@stitches/css'
import { createStyled } from '@stitches/styled'

export const css = createCss({
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
export const styled = createStyled(css)
