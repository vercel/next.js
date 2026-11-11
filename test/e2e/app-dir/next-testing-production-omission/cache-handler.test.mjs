import { readFileSync } from 'node:fs'
const data = JSON.parse(
  readFileSync(new URL('./cache-handler-data.json', import.meta.url), 'utf8')
)
if (data.value !== 'ordinary cache handler data')
  throw new Error('Cache handler asset missing')
export default class CacheHandler {
  async get() {
    return null
  }
  async set() {}
  async revalidateTag() {}
  resetRequestCache() {}
}
