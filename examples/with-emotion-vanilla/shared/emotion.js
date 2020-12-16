import createEmotion from '@emotion/css/create-instance'

export const {
  flush,
  hydrate,
  injectGlobal,
  keyframes,
  cx,
  css,
  cache,
  sheet,
} = createEmotion({ key: 'css-custom' })
