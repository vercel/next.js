import { params } from '../../lib/params'

export async function RepoInfo() {
  const { org, repo } = await params()
  return (
    <div id="repo-info">
      <span id="repo-info-org">{org}</span>
      <span id="repo-info-repo">{repo}</span>
    </div>
  )
}
