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
   * Merge another AccessProxy into this one, mutating this AccessProxy.
   *
   */
  public merge(other: TurborepoAccessTraceResult) {
    other.envVars.forEach((envVar) => this.envVars.add(envVar))
    other.fsPaths.forEach((path) => this.fsPaths.add(path))
    this.addresses.push(...other.addresses)

    return this
  }

  /**
   * Serialize this AccessProxy into a serializable object. Used for passing
   * the AccessProxy between workers where Sets are not serializable.
   *
   */
  public serialize(): SerializableTurborepoAccessTraceResult {
    return {
      fs: Array.from(this.fsPaths).map(String),
      addresses: this.addresses,
      envVars: Array.from(this.envVars).map(String),
    }
  }

  /**
   * Squash this AccessProxy into a public trace object that can be written to a file
   *
   */
  public toPublicTrace(): PublicTurborepoAccessTraceResult {
    return {
      accessedNetwork: this.addresses.length > 0,
      readEnvVarKeys: Array.from(this.envVars).map(String),
      accessedFilePaths: Array.from(this.fsPaths).map(String),
    }
  }

  /**
   * Create an AccessProxy from a serialized SerializableAccessProxy
   *
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
