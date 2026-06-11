// @ts-nocheck
/* eslint-disable */
// Alias with same API name, alias should be removed.
import { unstable_catchError as catchError } from 'next/error'
// Custom alias should be preserved.
import { unstable_catchError as withCatch } from 'next/error'

export const a = catchError(CompA)
export const b = withCatch(CompB)
