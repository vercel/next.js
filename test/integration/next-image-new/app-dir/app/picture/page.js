import { getImageProps } from 'next/image'

export default function Page() {
  const common = { alt: 'Hero', width: 400, height: 400, priority: true }
  const {
    props: { srcSet: dark },
  } = getImageProps({ ...common, src: '/test.png' })
  const {
    props: { srcSet: light, ...rest },
  } = getImageProps({ ...common, src: '/test_light.png' })
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={dark} />
      <source media="(prefers-color-scheme: light)" srcSet={light} />
      <img {...rest} />
    </picture>
  )
}
