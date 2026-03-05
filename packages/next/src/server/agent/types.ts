export type AgentMode = 'markdown' | 'json' | 'all'
export type AgentFormat = 'markdown' | 'json'

type Primitive = string | number | boolean | null

declare namespace AgentRoute {
  export type Action = {
    label: string
    href?: string
    method?: string
    description?: string
  }

  export type Section = {
    title?: string
    summary?: string
    content?: string
    url?: string
    actions?: Action[]
    sections?: Section[]
  }

  export type Document = {
    title?: string
    summary?: string
    canonicalUrl?: string
    sections?: Section[]
    actions?: Action[]
    metadata?: Record<string, Primitive | Primitive[]>
  }

  export type SemanticSitemap = Array<{
    url: string
    title?: string
    summary?: string
    lastModified?: string | Date
    sections?: Section[]
    actions?: Action[]
  }>
}

export type { AgentRoute }
