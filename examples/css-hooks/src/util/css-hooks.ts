import { createHooks, recommended } from '@css-hooks/react'

const [css, hooks] = createHooks({
  ...recommended,
  dark: '@media (prefers-color-scheme: dark)',
  large: '@media (min-width: 1024px)',
  groupHover: '.group:hover &',
  motionReduce: '@media (prefers-reduced-motion: reduce)',
})

export default hooks
export { css }
