export type ConfigFor<P> = {
  [K in keyof P]: P[K] extends string
    ? string[]
    : P[K] extends number
      ? number[]
      : P[K] extends boolean
        ? boolean[] | boolean
        : never
}

export interface Scenario {
  name: string
  config: Record<string, (string | number | boolean)[]>
  only: boolean
  fn: (props: Record<string, string | number | boolean>) => Promise<void>
}

export interface ScenarioVariant {
  scenario: Scenario
  props: Record<string, string | number | boolean>
}

export interface CurrentScenario {
  scenario: ScenarioVariant
  iface: FullInterface

  measurements: Map<
    string,
    {
      value: number
      unit: string
    }
  >
}

export type Interface = Partial<FullInterface>

export interface FullInterface {
  filterScenarios(scenarios: Scenario[]): Promise<Scenario[]>
  filterScenarioVariants(
    scenarioVariants: ScenarioVariant[]
  ): Promise<ScenarioVariant[]>

  start(
    scenario: string,
    props: Record<string, string | number | boolean | null>
  ): Promise<void>
  measurement(
    scenario: string,
    props: Record<string, string | number | boolean | null>,
    name: string,
    value: number,
    unit: string,
    relativeTo?: string
  ): Promise<void>
  end(
    scenario: string,
    props: Record<string, string | number | boolean | null>
  ): Promise<void>
  error(
    scenario: string,
    props: Record<string, string | number | boolean | null>,
    error: unknown
  ): Promise<void>

  finish(): Promise<void>
}

export function intoFullInterface(iface: Interface): FullInterface {
  return {
    filterScenarios: iface.filterScenarios ?? (async (scenarios) => scenarios),
    filterScenarioVariants:
      iface.filterScenarioVariants ??
      (async (scenarioVariants) => scenarioVariants),
    start: iface.start ?? (async () => {}),
    measurement: iface.measurement ?? (async () => {}),
    end: iface.end ?? (async () => {}),
    error: iface.error ?? (async () => {}),
    finish: iface.finish ?? (async () => {}),
  }
}

export {
  describe,
  measureTime,
  reportMeasurement,
  PREVIOUS,
} from './describe.js'
export { runScenarios } from './runner.js'
