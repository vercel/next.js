import type { API, FileInfo } from 'jscodeshift'
import { transformDynamicProps } from './next-async-dynamic-prop'
import { transformDynamicAPI } from './next-async-dynamic-api'

export default function transform(file: FileInfo, api: API) {
  const transforms = [transformDynamicProps, transformDynamicAPI]

  return transforms.reduce<string>(
    (source, transformFn) => transformFn(source, api, file.path),
    file.source
  )
}
