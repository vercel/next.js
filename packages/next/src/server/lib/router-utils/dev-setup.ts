import type { NextConfigComplete } from '../../config-shared'
import Watchpack from 'next/dist/compiled/watchpack'

export async function devSetup(opts: {
  dir: string
  config: NextConfigComplete
}) {
  const watcher = new Watchpack()
}
