// For simplicity we are creating our own types here.
// If you want the full types check out:
// https://github.com/octokit/openapi-types.ts
export type Repository = {
  id: number
  name: string
  full_name: string
  stargazers_count: number
  private: boolean
} & Record<string, unknown>
