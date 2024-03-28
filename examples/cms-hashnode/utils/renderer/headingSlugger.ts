import sanitizeHtml from 'sanitize-html'
import slug from 'slug'

export class HeadingSlugger {
  headings: { [key: string]: number }

  constructor() {
    this.headings = {}
  }

  static sanitizeSlug(str: string): string {
    return slug(sanitizeHtml(str, { allowedTags: [] }), { lower: true })
  }

  private doesHeadingExist(slug: string): boolean {
    // eslint-disable-next-line no-prototype-builtins
    return this.headings.hasOwnProperty(slug)
  }

  private findSafeSlug(originalSlug: string) {
    const headingExists = this.doesHeadingExist(originalSlug)

    if (!headingExists) {
      this.headings[originalSlug] = 0
      return originalSlug
    }
    let modifiedSlug
    let duplicateCount = this.headings[originalSlug]

    do {
      duplicateCount += 1
      modifiedSlug = `${originalSlug}-${duplicateCount}`
    } while (this.doesHeadingExist(modifiedSlug))

    this.headings[modifiedSlug] = 0
    this.headings[originalSlug] += 1
    return modifiedSlug
  }

  public getSlug(str: string) {
    const sanitizedSlug = HeadingSlugger.sanitizeSlug(str)
    return this.findSafeSlug(sanitizedSlug)
  }
}
