import path from 'path'

const projectDir = process.cwd()
path.join(projectDir, 'data', 'static-from-pkg.txt')
path.join('data', 'static-from-pkg.txt')

globalThis.myDirname = __dirname
path.join(globalThis.myDirname, 'foo.txt')

export default 'foo'
