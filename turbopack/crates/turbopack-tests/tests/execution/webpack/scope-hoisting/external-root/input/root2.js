import * as ns from './root2-module'

const f = () => 'ok'
f.x = function () {
  return this()
}

export default f

export { ns }
