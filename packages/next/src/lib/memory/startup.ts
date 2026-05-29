import v8 from 'v8'
import { info, warn } from '../../build/output/log'
import { italic } from '../picocolors'
import { startObservingGc } from './gc-observer'
import { startPeriodicMemoryUsageTracing } from './trace'

export function enableMemoryDebuggingMode(): void {
  // This will generate a heap snapshot when the program is close to the
  // memory limit. It does not give any warning to the user though which
  // can be jarring. If memory is large, this may take a long time.
  if ('setHeapSnapshotNearHeapLimit' in v8) {
    v8.setHeapSnapshotNearHeapLimit(1)
  }

  // This flag will kill the process when it starts to GC thrash when it's
  // close to the memory limit rather than continuing to try to collect
  // memory ineffectively.
  v8.setFlagsFromString('--detect-ineffective-gcs-near-heap-limit')

  // This allows users to generate a heap snapshot on demand just by sending
  // a signal to the process.
  process.on('SIGUSR2', () => {
    warn(
      `Received SIGUSR2 signal. Generating heap snapshot. ${italic(
        'Note: this will take some time.'
      )}`
    )
    v8.writeHeapSnapshot()
  })

  startObservingGc()
  startPeriodicMemoryUsageTracing()

  warn(
    `Memory debugging mode is enabled. ${italic(
      'Note: This will affect performance.'
    )}`
  )
  info(
    ' - Heap snapshots will be automatically generated when the process reaches more than 70% of the memory limit and again when the process is just about to run out of memory.'
  )
  info(
    ` - To manually generate a heap snapshot, send the process a SIGUSR2 signal: \`kill -SIGUSR2 ${process.pid}\``
  )
  info(
    ' - Heap snapshots when there is high memory will take a very long time to complete and may be difficult to analyze in tools.'
  )
  info(
    ' - See https://nextjs.org/docs/app/building-your-application/optimizing/memory-usage for more information.'
  )
}
