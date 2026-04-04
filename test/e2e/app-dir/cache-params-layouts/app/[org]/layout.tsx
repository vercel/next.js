import { provideParams } from '../lib/params'

export default function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ org: string }>
}) {
  provideParams(params)
  return <div id="org-layout">{children}</div>
}
