import type { RunnerTaskBase } from '../runner/public-task-types'

export type ReporterConsoleLog = NonNullable<RunnerTaskBase['logs']>[number]
export type ReporterTaskLogs = (taskId: string) => ReporterConsoleLog[]

interface FileLogSlot {
  value?: ReporterConsoleLog[]
}

export interface ReporterTaskLogStore {
  forTask: ReporterTaskLogs
  forFile(taskId: string): () => ReporterConsoleLog[]
  collectFile(taskId: string): void
  append(taskId: string, log: ReporterConsoleLog, file?: boolean): void
  nextGeneration(): ReporterTaskLogStore
}

/** Retain actual rows and the pinned controller's per-file array ownership. */
export function createReporterTaskLogs(
  fileLogs = new Map<string, FileLogSlot>()
): ReporterTaskLogStore {
  const logs = new Map<string, ReporterConsoleLog[]>()
  function fileSlot(taskId: string): FileLogSlot {
    let slot = fileLogs.get(taskId)
    if (!slot) {
      slot = {}
      fileLogs.set(taskId, slot)
    }
    return slot
  }
  return {
    forTask(taskId: string): ReporterConsoleLog[] {
      return [...(fileLogs.get(taskId)?.value ?? logs.get(taskId) ?? [])]
    },
    forFile(taskId: string) {
      const slot = fileSlot(taskId)
      return () => [...(slot.value ?? [])]
    },
    collectFile(taskId: string) {
      // Collection replaces the file task, carrying only a list which already
      // exists. If it is absent, a later list belongs to the replacement task.
      fileLogs.set(taskId, { value: fileSlot(taskId).value })
    },
    append(taskId: string, log: ReporterConsoleLog, file = false): void {
      if (file) (fileSlot(taskId).value ??= []).push(log)
      else {
        const current = logs.get(taskId)
        if (current) current.push(log)
        else logs.set(taskId, [log])
      }
    },
    nextGeneration() {
      // Existing file lists cross watch generations. Prior module views retain
      // their own slots; suite/test lists belong to their original generation.
      return createReporterTaskLogs(
        new Map([...fileLogs].map(([id, slot]) => [id, { value: slot.value }]))
      )
    },
  }
}
