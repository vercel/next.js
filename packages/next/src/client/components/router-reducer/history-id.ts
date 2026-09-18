let nextHistoryId = 1

export function getNextHistoryId(): number {
  return nextHistoryId++
}

export function setNextHistoryId(id: number): void {
  if (id >= nextHistoryId) {
    nextHistoryId = id + 1
  }
}
