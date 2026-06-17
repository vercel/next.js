import { sleep } from './page'

export default async function ExtraWork() {
  await sleep(500)

  return 'work'
}
