// Share the instance module in the next-shared layer
import { runInCleanSnapshot } from './clean-async-snapshot-instance' with { 'turbopack-transition': 'next-shared' }

export { runInCleanSnapshot }
