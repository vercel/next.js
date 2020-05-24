import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals'

export default onPerfEntry => {
  getCLS(onPerfEntry)
  getFID(onPerfEntry)
  getFCP(onPerfEntry)
  getLCP(onPerfEntry)
  getTTFB(onPerfEntry)
}
