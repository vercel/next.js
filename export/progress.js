import Progress from 'progress'

export default (total) => {
  if (process.stderr.isTTY) {
    return new Progress(
      `[:bar] :current/:total :percent :rate/s :etas `,
      {
        total
      }
    )
  } else {
    let current = 0
    let percent = 0
    let start = new Date()
    return {
      tick: () => {
        current += 1
        const ratio = Math.min(Math.max(current / total, 0), 1)
        const value = Math.floor(ratio * 100)
        if (value !== percent) {
          percent = value
          const elapsed = new Date() - start
          const eta = (percent === 100) ? 0 : elapsed * (total / current - 1)
          const rate = current / (elapsed / 1000)
          console.log(`    ${percent}% ${Math.round(rate)}/s ${(isNaN(eta) || !isFinite(eta)) ? '0.0' : (eta / 1000)
            .toFixed(1)}s`)
        }
      }
    }
  }
}
