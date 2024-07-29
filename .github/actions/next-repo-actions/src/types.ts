import { z } from 'zod'

const userSchema = z
  .object({
    avatar_url: z.string(),
    deleted: z.boolean(),
    email: z.string().nullable(),
    event_url: z.string(),
    followers_url: z.string(),
    following_url: z.string(),
    gists_url: z.string(),
    gravatar_id: z.string(),
    html_url: z.string(),
    id: z.number(),
    login: z.string(),
    node_id: z.string(),
    organizations_url: z.string(),
    received_events_url: z.string(),
    repos_url: z.string(),
    site_admin: z.boolean(),
    starred_url: z.string(),
    subscriptions_url: z.string(),
    type: z.enum(['Bot', 'User', 'Organization', 'Mannequin']),
    url: z.string(),
  })
  .strict()

export type User = z.infer<typeof userSchema>

export const issueSchema = z
  .object({
    active_lock_reason: z
      .enum(['resolved', 'off-topic', 'too_heated', 'spam'])
      .nullable(),
    assignee: userSchema.nullable(),
  })
  .strict()
  .describe('A GitHub issue.')

export type Issue = z.infer<typeof issueSchema>
