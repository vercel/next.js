import foo from 'foo'
import bar from 'bar'

export default () => (
  <div>
    Imported modules from another workspace:
    <pre>{foo}</pre>
    <pre>{bar}</pre>
  </div>
)
