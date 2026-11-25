// Without a loader, `turbopackAs` is applied first, then `turbopackModuleType`
// decides how the renamed source is processed (JSON, not JavaScript)
import data from '../../data3.jsonlike' with { turbopackAs: '*.js', turbopackModuleType: 'json' }

export default function Page() {
  return <p id="as-and-type">{data.greeting}</p>
}
