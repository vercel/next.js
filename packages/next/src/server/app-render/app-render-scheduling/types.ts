export type SequentialTaskScheduler = (
  tasks: (() => void)[],
  signal?: AbortSignal
) => void
