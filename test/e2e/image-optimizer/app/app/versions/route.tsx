import { connection } from 'next/server'
import { getSharp, isAvifDecodeSafe } from 'next/dist/server/image-optimizer'

export async function GET() {
  await connection()

  let sharp: any = null
  try {
    // Custom libvips builds do not report dependency versions, so the
    // absence of a heif version is treated as unsafe.
    sharp = getSharp(null)
  } catch (e) {
    console.log('failed to get sharp versions', e)
  }
  const heifVersion = sharp.versions?.heif ?? null
  const avifDecodeSafe = isAvifDecodeSafe(heifVersion)

  return new Response(
    JSON.stringify(
      {
        heifVersion: heifVersion ?? '<unknown>',
        avifDecodeSafe: avifDecodeSafe ?? '<unknown>',
        versions: sharp.versions ?? '<unknown>',
        node: process.versions ?? '<unknown>',
      },
      null,
      2
    ),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}
