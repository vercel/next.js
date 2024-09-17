import { NextResponse } from 'next/server'
import { ClientComponent } from '../../ClientComponent'
import { MyModuleClientComponent } from 'my-module/MyModuleClientComponent'

export function GET() {
  return NextResponse.json({
    clientComponent: typeof ClientComponent,
    myModuleClientComponent: typeof MyModuleClientComponent,
  })
}
