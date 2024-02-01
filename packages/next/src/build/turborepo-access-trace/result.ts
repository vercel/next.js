import type {
  Addresses,
  EnvVars,
  FS,
  SerializableTurborepoAccessTraceResult,
  PublicTurborepoAccessTraceResult,
} from './types'

export class TurborepoAccessTraceResult {
  constructor(
    private envVars: EnvVars = new Set([]),
    private addresses: Addresses = [],
    private fsPaths: FS = new Set([])
  ) {}

  /**
   * Merge another `TurborepoAccessTraceResult` into this one, mutating this `TurborepoAccessTraceResult`.
   */
  public merge(other: TurborepoAccessTraceResult) {
    other.envVars.forEach((envVar) => this.envVars.add(envVar))
    other.fsPaths.forEach((path) => this.fsPaths.add(path))
    this.addresses.push(...other.addresses)

    return this
  }

  /**
   * Serialize this `TurborepoAccessTraceResult` into a serializable object. Used for passing
   * the `TurborepoAccessTraceResult` between workers where Sets are not serializable.
   */
  public serialize(): SerializableTurborepoAccessTraceResult {
    return {
      fs: Array.from(this.fsPaths).map(String),
      addresses: this.addresses,
      envVars: Array.from(this.envVars).map(String),
    }
  }

  /**
   * Squash this `TurborepoAccessTraceResult` into a public trace object that can be written to a file
   */
  public toPublicTrace(): PublicTurborepoAccessTraceResult {
    return {
      network: this.addresses.length > 0,
      envVarKeys: Array.from(this.envVars).map(String),
      filePaths: Array.from(this.fsPaths).map(String),
    }
  }

  /**
   * Create an `TurborepoAccessTraceResult` from a serialized `SerializableTurborepoAccessTraceResult`
   */
  public static fromSerialized(
    serialized: SerializableTurborepoAccessTraceResult
  ) {
    return new TurborepoAccessTraceResult(
      new Set(serialized.envVars),
      serialized.addresses,
      new Set(serialized.fs)
    )
  }
}
