import type { BaseNextRequest, BaseNextResponse } from './'
import type { NodeNextRequest, NodeNextResponse } from './node'
import type { WebNextRequest, WebNextResponse } from './web'

/**
 * This file provides some helpers that should be used in conjunction with
 * explicit environment checks. When combined with the environment checks, it
 * will ensure that the correct typings are used as well as enable code
 * elimination.
 */

/**
 * Type guard to determine if a request is a WebNextRequest. This does not
 * actually check the type of the request, but rather the runtime environment.
 * It's expected that when the runtime environment is the edge runtime, that any
 * base request is a WebNextRequest.
 */
export const isWebNextRequest = (req: BaseNextRequest): req is WebNextRequest =>
  process.env.NEXT_RUNTIME === 'edge'

/**
 * Type guard to determine if a response is a WebNextResponse. This does not
 * actually check the type of the response, but rather the runtime environment.
 * It's expected that when the runtime environment is the edge runtime, that any
 * base response is a WebNextResponse.
 */
export const isWebNextResponse = (
  res: BaseNextResponse
): res is WebNextResponse => process.env.NEXT_RUNTIME === 'edge'

/**
 * Type guard to determine if a request is a NodeNextRequest. This does not
 * actually check the type of the request, but rather the runtime environment.
 * It's expected that when the runtime environment is the node runtime, that any
 * base request is a NodeNextRequest.
 */
export const isNodeNextRequest = (
  req: BaseNextRequest
): req is NodeNextRequest => process.env.NEXT_RUNTIME !== 'edge'

/**
 * Type guard to determine if a response is a NodeNextResponse. This does not
 * actually check the type of the response, but rather the runtime environment.
 * It's expected that when the runtime environment is the node runtime, that any
 * base response is a NodeNextResponse.
 */
export const isNodeNextResponse = (
  res: BaseNextResponse
): res is NodeNextResponse => process.env.NEXT_RUNTIME !== 'edge'
