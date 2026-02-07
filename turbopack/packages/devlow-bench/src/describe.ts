import type {
  ConfigFor,
  CurrentScenario,
  Interface,
  Scenario,
} from './index.js'
import compose from './interfaces/compose.js'
import { runScenarios } from './runner.js'

let currentScenarios: Scenario[] | null = null

export function setCurrentScenarios(scenarios: Scenario[] | null): void {
  currentScenarios = scenarios
}

export function describe<P>(
  name: string,
  config: ConfigFor<P>,
  fn: (props: P) => Promise<void>
): void {
  if (currentScenarios === null) {
    const scenarios = (currentScenarios = [])

    Promise.resolve().then(async () => {
      const ifaceNames = process.env.INTERFACE || 'interactive,console'
      const ifaces = []
      for (const ifaceName of ifaceNames.split(',').map((s) => s.trim())) {
        let iface: unknown
        try {
          iface = await import(`./interfaces/${ifaceName}.js`)
        } catch (e) {
          iface = await import(ifaceName)
        }
        iface = (iface && (iface as any).default) || iface
        if (typeof iface === 'function') {
          iface = await iface()
        }
        if (!iface) {
          throw new Error(`Interface ${ifaceName} is not a valid interface`)
        }
        ifaces.push(iface as Interface)
      }
      runScenarios(scenarios, compose(...ifaces))
    })
  }
  const normalizedConfig: Record<string, (string | number | boolean)[]> =
    Object.fromEntries(
      Object.entries(config).map(([key, value]) => [
        key,
        typeof value === 'boolean'
          ? [value, !value]
          : (value as (string | number | boolean)[]),
      ])
    )
  currentScenarios!.push({
    name,
    config: normalizedConfig,
    only: false,
    fn: fn as (
      props: Record<string, string | number | boolean>
    ) => Promise<void>,
  })
}

describe.only = function describeOnly<P>(
  name: string,
  config: ConfigFor<P>,
  fn: (props: P) => Promise<void>
): void {
  describe(name, config, fn)
  currentScenarios![currentScenarios!.length - 1].only = true
}

let currentScenario: CurrentScenario | null = null

export function withCurrent(
  current: CurrentScenario,
  fn: () => Promise<void>
): Promise<void> {
  const prev = currentScenario
  currentScenario = current
  return fn().finally(() => {
    currentScenario = prev
  })
}

export const PREVIOUS = Symbol('previous measurement with that unit')

export async function measureTime(
  name: string,
  options: {
    relativeTo?: string | typeof PREVIOUS
    scenario?: string
    props?: Record<string, string | number | null>
    offset?: number
  } = {}
) {
  const end = Date.now() - (options.offset || 0)
  await reportMeasurement(name, end, 'ms', {
    relativeTo: PREVIOUS,
    ...options,
  })
}

export async function reportMeasurement(
  name: string,
  value: number,
  unit: string,
  options: {
    relativeTo?: string | typeof PREVIOUS
    scenario?: string
    props?: Record<string, string | number | null>
  } = {}
) {
  if (!currentScenario) {
    throw new Error('reportMeasurement() must be called inside of describe()')
  }
  if (typeof name !== 'string') {
    throw new Error(
      'reportMeasurement() must be called with a name that is a string'
    )
  }
  if (typeof value !== 'number') {
    throw new Error(
      'reportMeasurement() must be called with a value that is a number'
    )
  }
  if (isNaN(value)) {
    throw new Error(
      'reportMeasurement() must be called with a value that is not NaN'
    )
  }
  if (!isFinite(value)) {
    throw new Error(
      'reportMeasurement() must be called with a value that is finite'
    )
  }
  if (typeof unit !== 'string') {
    throw new Error(
      'reportMeasurement() must be called with a unit that is a string'
    )
  }
  let { relativeTo, scenario, props } = options
  if (relativeTo === PREVIOUS) {
    relativeTo = 'previous'
    for (const [prevName, prev] of currentScenario.measurements) {
      if (prev.unit === unit) {
        relativeTo = prevName
      }
    }
  }
  currentScenario.measurements.set(name, {
    value,
    unit,
  })
  let reportedValue = value
  if (relativeTo) {
    const prev = currentScenario.measurements.get(relativeTo)
    if (!prev) {
      throw new Error(`No measurement named ${relativeTo} found`)
    }
    if (prev.unit !== unit) {
      throw new Error(
        `Measurement ${relativeTo} is not a "${unit}" measurement`
      )
    }
    reportedValue -= prev.value
  }
  await currentScenario.iface.measurement(
    scenario ?? currentScenario.scenario.scenario.name,
    props
      ? {
          ...currentScenario.scenario.props,
          ...props,
        }
      : currentScenario.scenario.props,
    name,
    reportedValue,
    unit,
    relativeTo
  )
}
