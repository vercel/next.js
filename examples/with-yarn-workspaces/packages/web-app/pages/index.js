import foo from '@withyarn/foo'
import Bar from '@withyarn/bar'

export default () => (
  <div>
    Imported modules from another workspace:
    <pre>{foo}</pre>
    <Bar />
  </div>
)
