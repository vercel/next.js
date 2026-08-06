/// <reference path="../.github/actions/next-integration-stat/src/manifest.d.ts" />

type ListArtifactsResponse = {
  total_count: number
  artifacts: Artifact[]
}

type Artifact = {
  id: number
  node_id: string
  name: string
  size_in_bytes: number
  url: string
  archive_download_url: string
  expired: false
  created_at: string
  expires_at: string
  updated_at: string
  workflow_run: WorkflowRun
}

type WorkflowRun = {
  id: number
  repository_id: number
  head_repository_id: number
  head_branch: string
  head_sha: string
}
