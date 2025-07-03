import type { ResolvedMetadata } from '../types/metadata-interface'
import type { Icon, IconDescriptor } from '../types/metadata-types'
import { IconMark } from './icon-mark'

import { MetaFilter } from './meta'

function IconDescriptorLink({ icon }: { icon: IconDescriptor }) {
  const { url, rel = 'icon', ...props } = icon

  return <link rel={rel} href={url.toString()} {...props} />
}

function IconLink({ rel, icon }: { rel?: string; icon: Icon }) {
  if (typeof icon === 'object' && !(icon instanceof URL)) {
    if (!icon.rel && rel) icon.rel = rel
    return IconDescriptorLink({ icon })
  } else {
    const href = icon.toString()
    return <link rel={rel} href={href} />
  }
}

export function IconsMetadata({ icons }: { icons: ResolvedMetadata['icons'] }) {
  if (!icons) return null

  const shortcutList = icons.shortcut
  const iconList = icons.icon
  const appleList = icons.apple
  const otherList = icons.other

  const hasIcon = Boolean(
    shortcutList?.length ||
      iconList?.length ||
      appleList?.length ||
      otherList?.length
  )
  if (!hasIcon) return null

  return MetaFilter([
    shortcutList
      ? shortcutList.map((icon) => IconLink({ rel: 'shortcut icon', icon }))
      : null,
    iconList ? iconList.map((icon) => IconLink({ rel: 'icon', icon })) : null,
    appleList
      ? appleList.map((icon) => IconLink({ rel: 'apple-touch-icon', icon }))
      : null,
    otherList ? otherList.map((icon) => IconDescriptorLink({ icon })) : null,
    hasIcon ? <IconMark /> : null,
  ])
}
