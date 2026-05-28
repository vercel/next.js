let installed = false

export function loadWebpackHook() {
  if (installed) {
    return
  }
  installed = true

  const { loadWebpackHook: installWebpackHook } =
    require('../webpack/load-webpack-hook') as typeof import('../webpack/load-webpack-hook')

  installWebpackHook()
}
