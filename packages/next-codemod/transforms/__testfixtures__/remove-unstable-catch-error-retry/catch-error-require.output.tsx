// @ts-nocheck
/* eslint-disable */
const { catchError } = require('next/error')
const nextError = require('next/error')

export const a = catchError(CompA)
export const b = nextError.catchError(CompB)
