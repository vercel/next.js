import { RenderedTimeAgo } from '#/ui/rendered-time-ago'

export function RenderingInfo({
  type,
}: {
  type: 'ssg' | 'ssgod' | 'ssr' | 'isr'
}) {
  let msg = ''
  switch (type) {
    case 'ssg':
      msg = 'Statically pre-rendered at build time'
      break
    case 'ssgod':
      msg = 'Statically rendered on demand'
      break
    case 'isr':
      msg = 'Statically pre-rendered at build time and periodically revalidated'
      break
    case 'ssr':
      msg = 'Dynamically rendered at request time'
      break
    default:
      msg = ''
  }

  return (
    <div className="space-y-3 rounded-lg bg-gray-900 p-3">
      <div className="text-sm text-gray-300">{msg}</div>

      <div className="flex">
        <RenderedTimeAgo timestamp={Date.now()} />
      </div>
    </div>
  )
}
