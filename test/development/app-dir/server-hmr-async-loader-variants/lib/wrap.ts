import { dep } from './dep'

// `dep` is already available here, so this import of `./dyn` gets an async
// loader that only loads the chunk of `./dyn`.
export async function viaWrap() {
  const { value } = await import('./dyn')
  return `wrap:${dep}:${value}`
}
