import type { NextRequest } from 'next/server'

// Present (matching all routes) so the shadowing checks are exercised on the
// pages-router navigation path that runs middleware, as a real i18n app would.
export function middleware(_request: NextRequest) {}
