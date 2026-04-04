import { Suspense } from 'react'
import { RepoInfo } from './repo-info'

export default function RepoPage() {
  return (
    <div id="repo-page">
      <h1>Repo Page</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <RepoInfo />
      </Suspense>
    </div>
  )
}
