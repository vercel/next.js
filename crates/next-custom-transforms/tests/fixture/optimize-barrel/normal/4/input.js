/* Test */
/* Test directives inside comments
'use server'
*/

// This should be kept
'use client'

import foo, { a, b } from 'foo'
import z from 'bar'

export { a as x }
export { y } from '1'
export { b }
export { foo as default, z }

// This should be removed as it's not on top
// prettier-ignore
'use strict'
