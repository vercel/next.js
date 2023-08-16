// app/send.ts
'use server'

import 'db'

console.log('side effect')

const foo = async () => {
  console.log('function body')
}
export { foo }
