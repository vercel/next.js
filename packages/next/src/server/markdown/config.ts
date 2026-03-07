import type { MarkdownComponents } from './runtime'

export type MarkdownRouteConfig<TRender = (...args: any[]) => unknown> = {
  enabled: boolean
  components: MarkdownComponents
  render?: TRender
}

export function getMarkdownRouteConfig<
  TRender = (...args: any[]) => unknown,
>(routeModule: {
  markdown?: unknown
  generateMarkdown?: unknown
}): MarkdownRouteConfig<TRender> {
  const markdown = normalizeMarkdownRouteConfig(routeModule.markdown)
  const render =
    typeof routeModule.generateMarkdown === 'function'
      ? (routeModule.generateMarkdown as TRender)
      : undefined

  return {
    enabled: markdown.enabled || !!render,
    components: markdown.components,
    render,
  }
}

function normalizeMarkdownRouteConfig(markdown: unknown): {
  enabled: boolean
  components: MarkdownComponents
} {
  if (markdown === true) {
    return {
      enabled: true,
      components: {},
    }
  }

  if (markdown && typeof markdown === 'object') {
    return {
      enabled: true,
      components:
        'components' in markdown &&
        markdown.components &&
        typeof markdown.components === 'object'
          ? (markdown.components as MarkdownComponents)
          : {},
    }
  }

  return {
    enabled: false,
    components: {},
  }
}
