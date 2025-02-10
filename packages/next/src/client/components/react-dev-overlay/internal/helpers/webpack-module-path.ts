const replacementRegExes = [
  /^(rsc:\/\/React\/[^/]+\/)/,
  /^webpack-internal:\/\/\/(\([\w-]+\)\/)?/,
  /^(webpack:\/\/\/|webpack:\/\/(_N_E\/)?)(\([\w-]+\)\/)?/,
  /\?\w+(\?\d+)?$/, // React replay error query param, .e.g. ?c69d?0, ?c69d
  /\?\d+$/, // React's fakeFunctionIdx query param
]

export function isWebpackInternalResource(file: string) {
  for (const regex of replacementRegExes) {
    if (regex.test(file)) return true

    file = file.replace(regex, '')
  }

  return false
}

/**
 * Format the webpack internal id to original file path
 *
 * webpack-internal:///./src/hello.tsx => ./src/hello.tsx
 * rsc://React/Server/webpack-internal:///(rsc)/./src/hello.tsx?42 => ./src/hello.tsx
 * rsc://React/Server/webpack:///app/indirection.tsx?14cb?0 => app/indirection.tsx
 * webpack://_N_E/./src/hello.tsx => ./src/hello.tsx
 * webpack://./src/hello.tsx => ./src/hello.tsx
 * webpack:///./src/hello.tsx => ./src/hello.tsx
 */
export function formatFrameSourceFile(sourceURL: string) {
  for (const regex of replacementRegExes) {
    sourceURL = sourceURL.replace(regex, '')
  }

  return sourceURL
}
