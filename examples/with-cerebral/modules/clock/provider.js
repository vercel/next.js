// milliseconds per second
const SECOND = 1000
let timer = null

export default function provider(context) {
  context.clock = {
    start(signalPath) {
      const signal = context.controller.getSignal(signalPath)

      function tick() {
        const now = Date.now()

        signal({ now })

        timer = setTimeout(tick, SECOND - (now % SECOND))
      }

      tick()
    },
    stop() {
      clearTimeout(timer)
    },
  }

  return context
}
