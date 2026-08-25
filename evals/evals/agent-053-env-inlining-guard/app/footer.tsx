'use client'

export function DeployFooter() {
  return (
    <footer>
      <small>
        build {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7)}
      </small>
    </footer>
  )
}
