let installed = false

export function loadWebpackHook() {
  if (installed) {
    return
  }
  installed = true

  const { loadWebpackHook: installWebpackHook } =
    require('next/dist/webpack/next-integration') as typeof import('next/dist/webpack/next-integration')

  installWebpackHook()
}
