import type { SequentialTaskScheduler } from './types'

const Impl =
  process.env.__NEXT_SEQUENTIAL_TASK_SCHEDULING === 'unstable_immediate'
    ? (require('./immediate-scheduler') as typeof import('./immediate-scheduler'))
    : process.env.__NEXT_SEQUENTIAL_TASK_SCHEDULING === 'unstable_message-port'
      ? (require('./message-port-scheduler') as typeof import('./message-port-scheduler'))
      : (require('./timer-scheduler') as typeof import('./timer-scheduler'))

export const scheduleSequentialTasks: SequentialTaskScheduler =
  Impl.scheduleSequentialTasks
