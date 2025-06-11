const replacementRegExes = [
  /^webpack-internal:\/\/\/(\([\w-]+\)\/)?/,
  /^(webpack:\/\/\/|webpack:\/\/(_N_E\/)?)(\([\w-]+\)\/)?/,
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
 * webpack://_N_E/./src/hello.tsx => ./src/hello.tsx
 * webpack://./src/hello.tsx => ./src/hello.tsx
 * webpack:///./src/hello.tsx => ./src/hello.tsx
 */
export function formatFrameSourceFile(file: string) {
  for (const regex of replacementRegExes) {
    file = file.replace(regex, '')
  }

  return file
}
