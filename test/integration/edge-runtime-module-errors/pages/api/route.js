
          import { NextResponse } from 'next/server'

          export default async function handler(request) {
            const { writeFile } = await import("fs")
            return Response.json({ ok: writeFile() })
          }

          export const config = { runtime: 'edge' }
        