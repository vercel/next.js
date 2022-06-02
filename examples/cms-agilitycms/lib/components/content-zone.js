import { requireComponentDependancyByName } from '../dependancies'

export default function ContentZone(props) {
  function RenderModules() {
    let modules = props.page.zones[props.name]

    return modules.map((m, i) => {
      const AgilityModule = requireComponentDependancyByName(m.moduleName)
      return <AgilityModule key={i} {...m.item} />
    })
  }

  return (
    <div>
      <RenderModules />
    </div>
  )
}
