import type { PropsWithChildren } from 'react'

type LayoutProps = PropsWithChildren<{}>

export default function Layout(props: LayoutProps) {
  return <div>{props.children}</div>
}
