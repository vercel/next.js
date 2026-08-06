'use server'

import ANYTHING from 'anything'

export const { sampleFunction } = ANYTHING
export const { sampleFunction2 } = ANYTHING()
export let { 0: sampleFunction3, 1: sampleFunction4 } = [ANYTHING(), ANYTHING()]
