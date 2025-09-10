import path from 'path'

import 'foo'

const projectDir = process.cwd()
path.join(projectDir, 'app', 'static-from-app.txt')

export default function Page() {
  return 'hello'
}
