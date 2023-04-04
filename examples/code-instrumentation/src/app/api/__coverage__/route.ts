import { NextResponse } from 'next/server'

/*
 * This route is used to retrieve the coverage data from the application.
 * It is only available when the server is running in coverage mode.
 * The instrumentation is done by the babel-plugin-istanbul.
 * See the babel.config.js file for more details.
 * */
export async function GET() {
  if ('__coverage__' in global) {
    return NextResponse.json((global as Record<string, unknown>).__coverage__)
  }
  return NextResponse.json(null)
}
