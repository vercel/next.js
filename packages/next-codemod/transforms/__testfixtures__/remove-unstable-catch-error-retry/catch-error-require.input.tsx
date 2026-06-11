// @ts-nocheck
/* eslint-disable */
const { unstable_catchError } = require('next/error')
const nextError = require('next/error')

export const a = unstable_catchError(CompA)
export const b = nextError.unstable_catchError(CompB)
