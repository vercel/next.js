import { createCss } from '@stitches/css'
import { createStyled } from '@stitches/styled'

export const css = createCss({
  tokens: {
    colors: {
      RED: 'tomato',
    },
  },
})

export const styled = createStyled(css)
