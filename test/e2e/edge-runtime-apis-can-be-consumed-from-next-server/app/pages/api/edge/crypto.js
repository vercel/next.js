import { cryptoTest } from '../../../src/crypto'
import { NextResponse } from 'next/server'

export const config = { runtime: 'experimental-edge' }
export default async (req) => NextResponse.json(await cryptoTest(req))
