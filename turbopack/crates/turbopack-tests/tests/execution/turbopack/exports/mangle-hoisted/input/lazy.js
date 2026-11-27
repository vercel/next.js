import {
  someLongExportName,
  aLongFunctionName,
  a as sharedShort,
} from './shared'
import {
  someLongExportName as secondName,
  a as secondShort,
  liveValue,
} from './second'

export const fromLazy = () =>
  `${someLongExportName}/${aLongFunctionName()}/${secondName}/${sharedShort}/${secondShort}/${liveValue}`
