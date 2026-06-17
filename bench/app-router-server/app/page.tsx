import ExtraWork from './extrawork'
import ExtraWork2 from './extrawork2'

/** Add your relevant code here for the issue to reproduce */
export default async function Home() {
  await sleep(500)

  return (
    <div>
      home
      <ExtraWork />
      <ExtraWork2 />
    </div>
  )
}

export const sleep = async (ms: number) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms)
  })
}
