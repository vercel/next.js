import { provideParams } from '../../lib/params'

export default function RepoLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ org: string; repo: string }>
}) {
  provideParams(params)
  return <div id="repo-layout">{children}</div>
}
