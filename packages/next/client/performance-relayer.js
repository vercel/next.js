import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals'

export default onPerfEntry => {
  // Measure Cumulative Layout Shift
  getCLS(({ id, value }) =>
    onPerfEntry({
      name: 'cumulative-layout-shift',
      value: value * 1000,
      label: 'web-vital',
      id,
    })
  )

  // Measure First Input Delay
  getFID(({ id, value, entries }) =>
    onPerfEntry({
      name: 'first-input-delay',
      startTime: entries[0].startTime,
      value,
      label: 'web-vital',
      id,
    })
  )

  // Measure Largest Contentful Paint
  getLCP(({ id, value }) =>
    onPerfEntry({
      name: 'largest-contentful-paint',
      value,
      label: 'web-vital',
      id,
    })
  )

  // Measure First Contentful Paint
  getFCP(({ id, value }) =>
    onPerfEntry({
      name: 'first-contentful-paint',
      value,
      label: 'web-vital',
      id,
    })
  )

  // Measure Time To First Byte
  getTTFB(({ id, value }) =>
    onPerfEntry({
      name: 'time-to-first-byte',
      value,
      label: 'web-vital',
      id,
    })
  )
}
