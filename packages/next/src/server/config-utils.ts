let installed = false

export function loadWebpackHook() {
  if (installed) {
    return
  }
  installed = true

  const { loadWebpackHook: installWebpackHook } =
    require('next/dist/webpack/load-webpack-hook') as {
      loadWebpackHook: () => void
    }

  installWebpackHook()
}
