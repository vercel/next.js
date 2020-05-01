/* global hydrationMetrics */

export default onPerfEntry => {
  hydrationMetrics.onInputDelay((delay, event) => {
    const hydrationMeasures = performance.getEntriesByName(
      'Next.js-hydration',
      'measure'
    )

    if (hydrationMeasures.length > 0) {
      const { startTime, duration } = hydrationMeasures[0]
      const hydrateEnd = startTime + duration

      if (event.timeStamp > hydrateEnd) {
        onPerfEntry({
          name: 'first-input-delay-after-hydration',
          startTime: event.timeStamp,
          duration: delay,
        })
      } else {
        onPerfEntry({
          name: 'first-input-delay-before-hydration',
          startTime: event.timeStamp,
          duration: delay,
        })
      }
    }
  })
}
