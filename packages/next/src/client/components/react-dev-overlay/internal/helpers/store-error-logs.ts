export const errorLogState: string[] = []

export function storeErrorLogsFromConsoleArgs(...args: any[]) {
  for (const arg of args) {
    console.log('arg', arg)
    if (typeof arg === 'string') {
      errorLogState.push(arg)
      continue
    }
    if ('message' in arg) {
      errorLogState.push(arg.message)
    }
    if ('stack' in arg) {
      errorLogState.push(arg.stack)
    }
  }
}
