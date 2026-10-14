import * as schemas from './schemas.js'
export const datetimeBase = () => {
  schemas.anyBase.init()
}
export function datetime() {
  return datetimeBase
}
