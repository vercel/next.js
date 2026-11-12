/** Pure locator descriptions, strict errors and DOM formatting. */
export declare function createBrowserLocatorFormatter(options?: {
  testIdAttribute?: string
}): {
  selector(name: string, args: unknown[]): string
  testIdSelector(attributeName: string, value: unknown): string
  filterText(value: string | RegExp): string
  createQuery(selector: () => string): () => Element[]
  asLocator(selector: string): string
  generateSelector(element: Element): string
  serializeElement(element: Element): { selector: string; locator: string }
  strictError(selector: string, elements: Element[]): Error
  formatAriaTree(container: Element): string
  missingError(selector: string, container: Element): Error
}
