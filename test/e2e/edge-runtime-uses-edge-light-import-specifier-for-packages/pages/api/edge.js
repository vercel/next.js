import edgeLightPackage from 'my-edge-light-package'
import edgeLightPackageExports from 'my-edge-light-package-exports'
import { NextResponse } from 'next/server'

export const config = { runtime: 'edge' }

export default function MyEdgeFunction() {
  return NextResponse.json({
    edgeLightPackage,
    edgeLightPackageExports,
  })
}
