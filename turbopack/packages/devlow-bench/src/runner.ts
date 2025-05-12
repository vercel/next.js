import { withCurrent } from './describe.js'
import { Interface, Scenario, intoFullInterface } from './index.js'

export async function runScenarios(
  scenarios: Scenario[],
  iface: Interface
): Promise<void> {
  const fullIface = intoFullInterface(iface)
  if (scenarios.some((scenario) => scenario.only)) {
    scenarios = scenarios.filter((scenario) => scenario.only)
  }
  scenarios = await fullIface.filterScenarios(scenarios)
  let variants = []
  for (const scenario of scenarios) {
    let props = [{}]
    for (const [key, options] of Object.entries(scenario.config)) {
      const newProps = []
      for (const prop of props) {
        if (prop === 'scenario' || prop === 'name')
          throw new Error("Cannot use 'scenario' or 'name' as a property name")
        for (const value of options) {
          newProps.push({
            ...prop,
            [key]: value,
          })
        }
      }
      props = newProps
    }
    variants.push(
      ...props.map((props) => ({
        scenario,
        props,
      }))
    )
  }
  variants = await fullIface.filterScenarioVariants(variants)

  for (const variant of variants) {
    try {
      const measurements = new Map()
      await withCurrent(
        {
          iface: fullIface,
          measurements,
          scenario: variant,
        },
        async () => {
          await fullIface.start(variant.scenario.name, variant.props)
          measurements.set('start', {
            value: Date.now(),
            unit: 'ms',
          })
          await variant.scenario.fn(variant.props)
          await fullIface.end(variant.scenario.name, variant.props)
        }
      )
    } catch (e) {
      await fullIface.error(variant.scenario.name, variant.props, e)
      process.exitCode = 1
    }
  }

  await fullIface.finish()
}
