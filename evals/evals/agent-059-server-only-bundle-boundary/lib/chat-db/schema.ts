import { attachmentTypeSchema } from '@/lib/attachments/schema'
import { integer, pgTable, text } from './runtime'

export { attachmentTypeSchema }

export const DB_ONLY_SCHEMA_MARKER = 'database-schema-must-stay-on-the-server'

export const users = pgTable('users', {
  id: text('id'),
  email: text('email'),
  plan: text('plan'),
})

export const chats = pgTable('chats', {
  id: text('id'),
  ownerId: text('owner_id'),
  title: text('title'),
})

export const messages = pgTable('messages', {
  id: text('id'),
  chatId: text('chat_id'),
  body: text('body'),
})

export const projects = pgTable('projects', {
  id: text('id'),
  ownerId: text('owner_id'),
  unreleasedWorkspaceMode: text('unreleased_workspace_mode'),
})

export const usage = pgTable('usage', {
  ownerId: text('owner_id'),
  credits: integer('credits'),
})
