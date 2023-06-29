/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/src/server/web/spec-extension/request'

it('should have 1 required parameter for constructor', () => {
  expect(NextRequest.length).toBe(1)
})
