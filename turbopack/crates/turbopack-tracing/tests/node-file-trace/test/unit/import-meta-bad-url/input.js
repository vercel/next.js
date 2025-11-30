import { readFileSync } from 'fs'

console.log(
  readFileSync(new URL(unknown ? './asset1.txt' : './asset2.txt', 'not-a-url'))
)
console.log(readFileSync(new URL(unknown ? 'a--b' : './asset2.txt')))
console.log(readFileSync(new URL(unknown ? './asset1.txt' : 'a--b')))
console.log(readFileSync(new URL('file:///none')))
console.log(readFileSync(new URL('--')))
console.log(readFileSync(new URL('--', '--')))
console.log(readFileSync(new URL()))
console.log(readFileSync(new URL('./test', unknown)))
console.log(readFileSync(new URL(unknown)))
