import {
  getCLS,
  getFCP,
  getFID,
  getLCP,
  getTTFB,
  Metric,
  ReportHandler,
} from 'web-vitals'

let isRegistered = false
let userReportHandler: ReportHandler | undefined

function onReport(metric: Metric) {
  if (userReportHandler) {
    userReportHandler(metric)
  }
}

export default (onPerfEntry?: ReportHandler) => {
  // Update function if it changes:
  userReportHandler = onPerfEntry

  // Only register listeners once:
  if (isRegistered) {
    return
  }
  isRegistered = true

  getCLS(onReport)
  getFID(onReport)
  getFCP(onReport)
  getLCP(onReport)
  getTTFB(onReport)
}
