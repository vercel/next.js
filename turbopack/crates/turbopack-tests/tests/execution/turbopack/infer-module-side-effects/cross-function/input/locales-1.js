import * as util from './util.js'
const error = () => {
  const foo = {
    string: 'unit',
  }
  return (issue) => {
    util.exec(foo)
  }
}
export default function () {
  return {
    localeError: error(),
  }
}
