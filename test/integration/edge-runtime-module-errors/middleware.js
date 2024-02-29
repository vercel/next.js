
          import { NextResponse } from 'next/server'

          export async function middleware(request) {
            const { writeFile } = await import("fs")
            return NextResponse.next()
          }
        