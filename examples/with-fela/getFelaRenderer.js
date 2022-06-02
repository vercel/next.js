import { createRenderer } from 'fela'
import webPreset from 'fela-preset-web'

export default function getRenderer() {
  return createRenderer({
    plugins: [...webPreset],
  })
}
