import {
  getCLS,
  getFCP,
  getFID,
  getLCP,
  getTTFB,
  ReportHandler,
} from 'web-vitals'

export default (onPerfEntry: ReportHandler) => {
  getCLS(onPerfEntry)
  getFID(onPerfEntry)
  getFCP(onPerfEntry)
  getLCP(onPerfEntry)
  getTTFB(onPerfEntry)
}
