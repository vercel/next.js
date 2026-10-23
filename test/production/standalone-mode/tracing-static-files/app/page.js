import path from 'path'

import 'foo'
import {
  readNullishFallback,
  readDefaultParam,
  readBareDynamic,
} from './read-alternatives'

const projectDir = process.cwd()
path.join(projectDir, 'data', 'static-from-app-cwd.txt')

path.join('data', 'static-from-app-rel-join.txt')
path.join('data', 'static-from-app-rel-read.txt')

export default function Page() {
  readNullishFallback()
  readDefaultParam()
  readBareDynamic()
  return 'hello'
}
