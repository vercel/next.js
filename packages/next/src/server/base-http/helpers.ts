import type { BaseNextRequest, BaseNextResponse } from './'
import type { NodeNextRequest, NodeNextResponse } from './node'
import type { WebNextRequest, WebNextResponse } from './web'

/**
 * This file provides some helpers that should be used in conjunction with
 * explicit environment checks. When combined with the environment checks, it
 * will ensure that the correct typings are used as well as enable code
 * elimination.
 */

// Cache the runtime check at module level. process.env access in Node.js
// involves a property lookup on a special object that is not free, and
// NEXT_RUNTIME never changes after process start. These guards are called
// multiple times per request (5+), so caching avoids repeated overhead.
const _isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'
const _isNodeRuntime = !_isEdgeRuntime

/**
 * Type guard to determine if a request is a WebNextRequest. This does not
 * actually check the type of the request, but rather the runtime environment.
 * It's expected that when the runtime environment is the edge runtime, that any
 * base request is a WebNextRequest.
 */
export const isWebNextRequest = (req: BaseNextRequest): req is WebNextRequest =>
  _isEdgeRuntime

/**
 * Type guard to determine if a response is a WebNextResponse. This does not
 * actually check the type of the response, but rather the runtime environment.
 * It's expected that when the runtime environment is the edge runtime, that any
 * base response is a WebNextResponse.
 */
export const isWebNextResponse = (
  res: BaseNextResponse
): res is WebNextResponse => _isEdgeRuntime

/**
 * Type guard to determine if a request is a NodeNextRequest. This does not
 * actually check the type of the request, but rather the runtime environment.
 * It's expected that when the runtime environment is the node runtime, that any
 * base request is a NodeNextRequest.
 */
export const isNodeNextRequest = (
  req: BaseNextRequest
): req is NodeNextRequest => _isNodeRuntime

/**
 * Type guard to determine if a response is a NodeNextResponse. This does not
 * actually check the type of the response, but rather the runtime environment.
 * It's expected that when the runtime environment is the node runtime, that any
 * base response is a NodeNextResponse.
 */
export const isNodeNextResponse = (
  res: BaseNextResponse
): res is NodeNextResponse => _isNodeRuntime
