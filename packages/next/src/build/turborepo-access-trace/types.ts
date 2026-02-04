/**
 * A single Addr / Port pair that was accessed during the duration of the trace
 */
export interface Address {
  addr: string
  port: string
}

/**
 * Tracked environment variable keys that were accessed during the duration of the trace
 */
export type EnvVars = Set<string | Symbol>

/**
 * Tracks the file system paths that were accessed during the duration of the trace
 */
export type FS = Set<string>

/**
 * Tracked Addr / Port pairs that were accessed during the duration of the trace
 */
export type Addresses = Array<Address>

/**
 * The serializable version of `TurborepoAccessTraceResult` - this is required to pass the `TurborepoAccessTraceResult`
 * between workers where Sets are not serializable.
 */
export type SerializableTurborepoAccessTraceResult = Readonly<{
  fs: Array<string>
  addresses: Addresses
  envVars: Array<string>
}>

/**
 *  The public version of `TurborepoAccessTraceResult` - this is what is written to the trace file
 */
export type PublicTurborepoAccessTraceResult = Readonly<{
  filePaths: Array<string>
  network: boolean
  envVarKeys: Array<string>
}>

/**
 * A function that restores the original state of a proxy
 */
export type RestoreOriginalFunction = () => void
