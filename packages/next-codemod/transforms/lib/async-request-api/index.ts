import type { API, FileInfo } from 'jscodeshift'
import { transformDynamicProps } from './next-async-dynamic-prop'
import { transformDynamicAPI } from './next-async-dynamic-api'

export default function transform(file: FileInfo, api: API) {
  const filePath = file.path
  // if it's node_modules or types file, skip
  if (/node_modules/.test(filePath) || /\.d\.(m|c)?ts$/.test(filePath)) {
    return file.source
  }
  const transforms = [transformDynamicProps, transformDynamicAPI]

  return transforms.reduce<string>((source, transformFn) => {
    const result = transformFn(source, api, file.path)
    if (!result) {
      return source
    }
    return result
  }, file.source)
}
