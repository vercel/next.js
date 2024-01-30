import { defer } from '@defer/client'

// a background function must be `async`
const helloWorld = async (name: string) => {
  // print "Hello X after 15 seconds"
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`Hello ${name}!`)
      resolve('done')
    }, 15000)
  })
}

// the function must be wrapped with `defer()` and exported as default
export default defer(helloWorld)
