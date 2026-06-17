export let entries = []
export let currentTick = 0

let running = false

export async function start() {
  entries = []
  running = true
  currentTick = 0
  while (running) {
    await 0
    currentTick++
  }
}

export function stop() {
  running = false
  return entries
}

export function report(name) {
  entries.push(`${name} ${currentTick}`)
}
