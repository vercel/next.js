import { cacheTag } from 'next/cache'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'

const isProductionBuild = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD

async function getData() {
  'use cache'

  cacheTag('cached-page')

  if (!isProductionBuild) {
    throw new Error('regeneration failed')
  }

  return 'generated during build'
}

export default async function Page() {
  return <p>{await getData()}</p>
}
