import { fileURLToPath } from 'url'

export function pathify(path: string) {
  if (path.startsWith('file://')) {
    path = fileURLToPath(path)
  }
  return path
}

export function instantiateEmscriptenWasm(
  factory: (args: { locateFile: () => string }) => {
    decode?: (
      buffer: Buffer | Uint8Array,
      width: number,
      height: number,
      opts: any
    ) => Buffer
    encode?: (
      buffer: Buffer | Uint8Array,
      width: number,
      height: number,
      opts: any
    ) => Buffer
  },
  path: string
) {
  return factory({
    locateFile() {
      return pathify(path)
    },
  })
}
