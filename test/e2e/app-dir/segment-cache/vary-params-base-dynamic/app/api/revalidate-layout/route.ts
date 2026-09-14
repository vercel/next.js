import { revalidatePath, revalidateTag } from 'next/cache'
import { NextRequest } from 'next/server'

type RevalidateMode =
  | 'tag-layout-expireNow'
  | 'tag-layout-max'
  | 'tag-layout-legacy'
  | 'path-root-layout'
  | 'path-team-layout'
  | 'path-team-page'

function isRevalidateMode(value: string): value is RevalidateMode {
  return (
    value === 'tag-layout-expireNow' ||
    value === 'tag-layout-max' ||
    value === 'tag-layout-legacy' ||
    value === 'path-root-layout' ||
    value === 'path-team-layout' ||
    value === 'path-team-page'
  )
}

export async function GET(request: NextRequest) {
  const modeQuery = request.nextUrl.searchParams.get('mode')
  const mode: RevalidateMode =
    modeQuery && isRevalidateMode(modeQuery)
      ? modeQuery
      : 'tag-layout-expireNow'

  switch (mode) {
    case 'tag-layout-expireNow':
      revalidateTag('_N_T_/layout', 'expireNow')
      break
    case 'tag-layout-max':
      revalidateTag('_N_T_/layout', 'max')
      break
    case 'tag-layout-legacy':
      // Intentionally test the deprecated call shape without a profile arg.
      // @ts-expect-error
      revalidateTag('_N_T_/layout')
      break
    case 'path-root-layout':
      revalidatePath('/', 'layout')
      break
    case 'path-team-layout':
      revalidatePath('/acme/dashboard', 'layout')
      break
    case 'path-team-page':
      revalidatePath('/acme/dashboard')
      break
    default:
      break
  }

  return Response.json({
    revalidated: true,
    mode,
  })
}
