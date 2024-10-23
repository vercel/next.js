const replacementRegExes = [
  /^(rsc:\/\/React\/[^/]+\/)/,
  /^webpack-internal:\/\/\/(\([\w-]+\)\/)?/,
  /^(webpack:\/\/\/|webpack:\/\/(_N_E\/)?)(\([\w-]+\)\/)?/,
  /\?\d+$/, // React's fakeFunctionIdx query param
]

export function isWebpackBundled(file: string) {
  for (const regex of replacementRegExes) {
    if (regex.test(file)) return true

    file = file.replace(regex, '')
  }

  return false
}

/**
 * Format the webpack internal id to original file path
 * webpack-internal:///./src/hello.tsx => ./src/hello.tsx
 * rsc://React/Server/webpack-internal:///(rsc)/./src/hello.tsx?42 => ./src/hello.tsx
 * webpack://_N_E/./src/hello.tsx => ./src/hello.tsx
 * webpack://./src/hello.tsx => ./src/hello.tsx
 * webpack:///./src/hello.tsx => ./src/hello.tsx
 *
 * <anonymous> => ''
 */
export function formatFrameSourceFile(file: string) {
  if (file === '<anonymous>') return ''

  for (const regex of replacementRegExes) {
    file = file.replace(regex, '')
  }

  return file
}
