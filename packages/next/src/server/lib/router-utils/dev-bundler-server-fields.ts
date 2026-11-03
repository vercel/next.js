import type { SetupOpts } from './dev-bundler-types'
import type { PropagateToWorkersField } from './types'

export async function propagateServerField(
  opts: SetupOpts,
  field: PropagateToWorkersField,
  args: any
) {
  await opts.renderServer?.instance?.propagateServerField(opts.dir, field, args)
}
