'use server'

let counter = 0

export async function incrementCounter() {
  console.log('Button clicked!')

  counter++
  return counter
}
