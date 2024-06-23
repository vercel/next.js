import type { Readable } from 'node:stream'
import type { DeepReadonly } from '../../../shared/lib/deep-readonly'
import type { ClientReferenceManifest } from '../../../build/webpack/plugins/flight-manifest-plugin'

export function useFlightStream<T>(
  flightStream: Readable | ReadableStream<Uint8Array>,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  nonce?: string
): Promise<T>

export function flightRenderComplete(
  flightStream: Readable | ReadableStream<Uint8Array>
): Promise<void>

export function createInlinedDataReadableStream(
  flightStream: Readable | ReadableStream<Uint8Array>,
  nonce: string | undefined,
  formState: unknown | null
): Readable | ReadableStream<Uint8Array>
