import { NextResponse } from 'next/server'
import { urlPatternTest } from '../../../src/url-pattern'

export const config = { runtime: 'experimental-edge' }

export default (req) => NextResponse.json(urlPatternTest(req))
