import { NextResponse } from 'next/server'

/*
 * This path enables the extraction of coverage information from the
 * application and is accessible exclusively when the server operates
 * in coverage mode. The babel-plugin-istanbul carries out the instrumentation.
 * For further information, refer to the babel.config.js file.
 * */
export async function GET() {
  if ('__coverage__' in global) {
    return NextResponse.json((global as Record<string, unknown>).__coverage__)
  }
  return NextResponse.json(null)
}
