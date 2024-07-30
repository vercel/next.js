import { stat } from 'fs'
import { env } from 'process'
import { update } from 'relay-runtime/lib/handlers/connection/ConnectionHandler'
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
    name: z.string().optional(),
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

const labelSchema = z
  .object({
    color: z.string(),
    default: z.boolean(),
    description: z.string().nullable(),
    id: z.number(),
    name: z.string(),
    node_id: z.string(),
    url: z.string(),
  })
  .strict()

const milestoneSchema = z
  .object({
    closed_at: z.string().nullable(),
    closed_issues: z.number(),
    created_at: z.string(),
    creator: userSchema.nullable(),
    description: z.string().nullable(),
    due_on: z.string().nullable(),
    html_url: z.string(),
    id: z.number(),
    labels_url: z.string(),
    node_id: z.string(),
    number: z.number(),
    open_issues: z.number(),
    state: z.enum(['closed', 'open']),
    title: z.string(),
    updated_at: z.string(),
    url: z.string(),
  })
  .strict()
  .describe('A collection of related issues.')

const permissionsSchema = z
  .object({
    actions: z.enum(['read', 'write']),
    administration: z.enum(['read', 'write']),
    content_references: z.enum(['read', 'write']),
    contents: z.enum(['read', 'write']),
    deployments: z.enum(['read', 'write']),
    discussions: z.enum(['read', 'write']),
    emails: z.enum(['read', 'write']),
    environments: z.enum(['read', 'write']),
    issues: z.enum(['read', 'write']),
    keys: z.enum(['read', 'write']),
    members: z.enum(['read', 'write']),
    metadata: z.enum(['read', 'write']),
    organization_administration: z.enum(['read', 'write']),
    organization_hooks: z.enum(['read', 'write']),
    organization_packages: z.enum(['read', 'write']),
    organization_plan: z.enum(['read', 'write']),
    organization_projects: z.enum(['read', 'write']),
    organization_secrets: z.enum(['read', 'write']),
    organization_self_hosted_runners: z.enum(['read', 'write']),
    organization_user_blocking: z.enum(['read', 'write']),
    packages: z.enum(['read', 'write']),
    pages: z.enum(['read', 'write']),
    pull_requests: z.enum(['read', 'write']),
    repository_hooks: z.enum(['read', 'write']),
    repository_projects: z.enum(['read', 'write']),
    secret_scanning_alerts: z.enum(['read', 'write']),
    secrets: z.enum(['read', 'write']),
    security_events: z.enum(['read', 'write']),
    security_scanning_alert: z.enum(['read', 'write']),
    single_file: z.enum(['read', 'write']),
    statuses: z.enum(['read', 'write']),
    team_discussions: z.enum(['read', 'write']),
    vulnerability_alerts: z.enum(['read', 'write']),
    workflows: z.enum(['read', 'write']),
  })
  .strict()

const performedViaGitHubAppSchema = z
  .object({
    created_at: z.string().nullable(),
    description: z.string().nullable(),
    events: z.enum([
      'branch_protection_rule',
      'check_run',
      'check_suite',
      'code_scanning_alert',
      'commit_comment',
      'content_reference',
      'create',
      'delete',
      'deployment',
      'deployment_review',
      'deployment_status',
      'deploy_key',
      'discussion',
      'discussion_comment',
      'fork',
      'gollum',
      'issues',
      'issue_comment',
      'label',
      'member',
      'membership',
      'milestone',
      'organization',
      'org_block',
      'page_build',
      'project',
      'project_card',
      'project_column',
      'public',
      'pull_request',
      'pull_request_review',
      'pull_request_review_comment',
      'push',
      'registry_package',
      'release',
      'repository',
      'repository_dispatch',
      'secret_scanning_alert',
      'star',
      'status',
      'team',
      'team_add',
      'watch',
      'workflow_dispatch',
      'workflow_run',
      'reminder',
      'pull_request_review_thread',
    ]),
    external_url: z.string().nullable(),
    html_url: z.string(),
    id: z.number().nullable(),
    name: z.string(),
    node_id: z.string(),
    owner: userSchema.nullable(),
    permissions: permissionsSchema,
    slug: z.string(),
    updated_at: z.string().nullable(),
  })
  .strict()

const pullRequestSchema = z
  .object({
    diff_url: z.string(),
    html_url: z.string(),
    merged_at: z.string().nullable(),
    patch_url: z.string(),
    url: z.string(),
  })
  .strict()

const reactionSchema = z
  .object({
    '+1': z.number(),
    '-1': z.number(),
    confused: z.number(),
    eyes: z.number(),
    heart: z.number(),
    hooray: z.number(),
    laugh: z.number(),
    rocket: z.number(),
    total_count: z.number(),
    url: z.string(),
  })
  .strict()

export const issueSchema = z
  .object({
    active_lock_reason: z
      .enum(['resolved', 'off-topic', 'too_heated', 'spam'])
      .nullable(),
    assignee: userSchema.nullable(),
    assignees: z.array(userSchema).default([]),
    author_association: z.enum([
      'COLLABORATOR',
      'CONTRIBUTOR',
      'FIRST_TIMER',
      'FIRST_TIME_CONTRIBUTOR',
      'MANNEQUIN',
      'MEMBER',
      'NONE',
      'OWNER',
    ]),
    body: z.string().nullable(),
    closed_at: z.string().nullable(),
    comments: z.number(),
    comments_url: z.string(),
    created_at: z.string(),
    events_url: z.string(),
    html_url: z.string(),
    id: z.number(),
    labels: z.array(labelSchema).default([]),
    labels_url: z.string(),
    locked: z.boolean(),
    milestone: milestoneSchema.nullable(),
    node_id: z.string(),
    number: z.number(),
    performed_via_github_app: performedViaGitHubAppSchema.nullable(),
    reactions: reactionSchema,
    repository_url: z.string(),
    state: z.enum(['closed', 'open']),
    state_reason: z.string().nullable(),
    timeline_url: z.string(),
    title: z.string(),
    updated_at: z.string(),
    url: z.string(),
    user: userSchema.nullable(),
  })
  .strict()
  .describe('A GitHub issue.')

export type Issue = z.infer<typeof issueSchema>
