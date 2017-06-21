import { createRenderer } from 'fela'
import webPreset from 'fela-preset-web'

const felaRenderer = createRenderer({
  plugins: [...webPreset],
})

export default felaRenderer
