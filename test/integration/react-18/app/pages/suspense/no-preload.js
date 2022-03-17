import { Suspense } from 'react'
import dynamic from 'next/dynamic'

const Bar = dynamic(() => import('../../components/bar'), {
  suspense: true,
  // Explicitly declare loaded modules.
  // For suspense cases, they'll be ignored.
  // For loadable component cases, they'll be handled
  loadableGenerated: {
    modules: ['../../components/bar'],
    webpack: [require.resolveWeak('../../components/bar')],
  },
})

export default function NoPreload() {
  return (
    <Suspense fallback={'rab'}>
      <Bar />
    </Suspense>
  )
}
