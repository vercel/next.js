import IsDevServer from './invariants/isDevServer'
import TrailingSlash from './invariants/trailingSlash'
import ExperimentalOptimisticRouting from './invariants/experimentalOptimisticRouting'

export default function Page() {
  return (
    <dl>
      <IsDevServer />
      <TrailingSlash />
      <ExperimentalOptimisticRouting />
    </dl>
  )
}
