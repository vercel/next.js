import path from 'path'

import 'foo'

const projectDir = process.cwd()
path.join(projectDir, 'data', 'static-from-app-cwd.txt')

path.join('data', 'static-from-app-rel-join.txt')
path.join('data', 'static-from-app-rel-read.txt')

export default function Page() {
  return 'hello'
}
