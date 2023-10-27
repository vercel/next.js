const ERROR_MESSAGE =
  'Internal Error: do not use legacy react-dom/server APIs. If you encountered this error, please open an issue on the Next.js repo.'

export function renderToString() {
  throw new Error(ERROR_MESSAGE)
}

export function renderToStaticMarkup() {
  throw new Error(ERROR_MESSAGE)
}
