import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'
import { toolsDirectory } from './fixture'

export type DeliveredTree = {
  path: string
  head: string
  status: string
  files: Record<string, string>
}
export type Artifact = {
  trees: DeliveredTree[]
  evidence: Record<string, string>
  capturedAt: string
}

// Capture committed, dirty and untracked source in every actual Git worktree.
// Exclude caches and credential files, and reject symlinks instead of exporting
// paths outside an app. This runs before grader code/dependencies are uploaded.
export async function captureArtifact(
  sandbox: Sandbox,
  directory: string
): Promise<Artifact> {
  const source = readFileSync(join(__dirname, 'capture.mjs'), 'utf8')
  await sandbox.writeFiles({ [`${toolsDirectory}/capture.mjs`]: source })
  const result = await sandbox.runCommand('node', [
    `${toolsDirectory}/capture.mjs`,
    sandbox.getWorkingDirectory(),
  ])
  if (result.exitCode !== 0) {
    if (
      (
        await sandbox.runCommand('test', [
          '-f',
          `${toolsDirectory}/capture-failure.json`,
        ])
      ).exitCode === 0
    ) {
      let failure = await sandbox.readFile(
        `${toolsDirectory}/capture-failure.json`
      )
      for (const name of [
        'VERCEL_OIDC_TOKEN',
        'AI_GATEWAY_API_KEY',
        'VERCEL_TOKEN',
      ]) {
        const secret = process.env[name]
        if (secret) {
          failure = failure.split(secret).join('[REDACTED]')
        }
      }
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'capture-failure.json'), failure)
    }
    throw new Error(`Artifact capture failed: ${result.stderr}`)
  }
  const artifact: Artifact = JSON.parse(
    await sandbox.readFile(`${toolsDirectory}/artifact.json`)
  )
  // Native transcript redaction does not cover custom host artifacts.
  const secrets = ['VERCEL_OIDC_TOKEN', 'AI_GATEWAY_API_KEY', 'VERCEL_TOKEN']
    .map((name) => process.env[name])
    .filter((value): value is string => Boolean(value))
  for (const tree of artifact.trees) {
    for (const [path, data] of Object.entries(tree.files)) {
      const buffer = Buffer.from(data, 'base64')
      if (secrets.some((secret) => buffer.includes(Buffer.from(secret)))) {
        throw new Error(`Credential found in delivered artifact: ${path}`)
      }
    }
  }
  for (const path of Object.keys(artifact.evidence)) {
    for (const secret of secrets) {
      artifact.evidence[path] = artifact.evidence[path]
        .split(secret)
        .join('[REDACTED]')
    }
  }
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'artifact.json'),
    JSON.stringify(artifact, null, 2)
  )
  return artifact
}
