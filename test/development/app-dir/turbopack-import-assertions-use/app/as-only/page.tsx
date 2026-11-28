// `turbopackAs` without `turbopackLoader` renames the source, so it is
// processed as JavaScript
import value from '../../code.jsish' with { turbopackAs: '*.js' }

export default function Page() {
  return <p id="as-only">{value}</p>
}
