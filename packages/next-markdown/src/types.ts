export type MarkdownComponentContext = {
  tagName?: string
  componentName?: string
  attributes: Record<string, string>
  children: string
  textContent: string
  renderDefault: () => string
}

export type MarkdownComponent = (
  context: MarkdownComponentContext
) => string | null | undefined

export type MarkdownComponents = Record<string, MarkdownComponent>

export type MarkdownSegmentDefinition = {
  id: string
  props: any
  components?: MarkdownComponents
  render?: (
    props: any,
    helpers: {
      content: string
      children: string
    }
  ) => string | Promise<string> | null | undefined
}
