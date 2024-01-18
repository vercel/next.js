import type {
  Paths,
  Addresses,
  EnvVars,
  SerializableAccessProxy,
  PublicAccessProxy,
} from './types'

export class AccessProxy {
  private envVars: EnvVars = new Set([])
  private addresses: Addresses = []
  private paths: Paths = {
    read: new Set(),
    checked: new Set(),
  }

  /**
   * Create an AccessProxy from a set of environment variables, addresses, and paths.
   */
  constructor(envVars?: EnvVars, addresses?: Addresses, paths?: Paths) {
    if (envVars) this.envVars = envVars
    if (addresses) this.addresses = addresses
    if (paths) this.paths = paths
  }

  /**
   * Merge another AccessProxy into this one, mutating this AccessProxy.
   *
   */
  public merge(other: AccessProxy) {
    this.addresses.push(...other.addresses)
    other.envVars.forEach((envVar) => this.envVars.add(envVar))
    other.paths.read.forEach((path) => this.paths.read.add(path))
    other.paths.checked.forEach((path) => this.paths.checked.add(path))

    return this
  }

  /**
   * Serialize this AccessProxy into a serializable object. Used for passing
   * the AccessProxy between workers where Sets are not serializable.
   *
   */
  public serialize(): SerializableAccessProxy {
    return {
      paths: {
        read: Array.from(this.paths.read),
        checked: Array.from(this.paths.checked),
      },
      addresses: this.addresses,
      envVars: Array.from(this.envVars).map(String),
    }
  }

  /**
   * Squash this AccessProxy into a public trace object that can be written to a file
   *
   */
  public toPublicTrace(): PublicAccessProxy {
    return {
      accessedNetwork: this.addresses.length > 0,
      readEnvVarKeys: Array.from(this.envVars).map(String),
      paths: {
        read: Array.from(this.paths.read),
        checked: Array.from(this.paths.checked),
      },
    }
  }

  /**
   * Create an AccessProxy from a serialized SerializableAccessProxy
   *
   */
  public static fromSerialized(serialized: SerializableAccessProxy) {
    return new AccessProxy(new Set(serialized.envVars), serialized.addresses, {
      read: new Set(serialized.paths.read),
      checked: new Set(serialized.paths.checked),
    })
  }
}
