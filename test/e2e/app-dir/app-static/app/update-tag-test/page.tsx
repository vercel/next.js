import { unstable_cache } from 'next/cache'
import { Buttons } from './buttons'

const getTimestamp = unstable_cache(
  async () => {
    return {
      timestamp: Date.now(),
      random: Math.random(),
    }
  },
  ['timestamp'],
  {
    tags: ['test-update-tag'],
  }
)

export default async function UpdateTagTest() {
  const data = await getTimestamp()

  return (
    <div>
      <h1>Update Tag Test</h1>
      <div id="data">{JSON.stringify(data)}</div>
      <Buttons />
    </div>
  )
}
