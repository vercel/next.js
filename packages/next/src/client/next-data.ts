import type { NEXT_DATA } from '../shared/lib/utils'
import type { createRoute, Route } from '../shared/lib/route-types'

/**
 * Ingest the Pages hydration data emitted by server/render and serialized by
 * pages/_document. Its page field is the renderer's URL pattern, not an App
 * module identifier. The public NEXT_DATA and Window declarations stay strings.
 *
 * This trusts that specific producer schema; it does not validate JSON, read
 * fields or change the original object. Untyped JSON must supply NEXT_DATA as its
 * schema. Guard known page-field brands and retain all other fields/modifiers.
 */
export function ingestNextData<Value extends NEXT_DATA>(
  value: Value &
    NoInfer<{ page: Parameters<typeof createRoute<Value['page']>>[0] }>
): { [Key in keyof Value]: Key extends 'page' ? Route : Value[Key] } {
  return value as unknown as {
    [Key in keyof Value]: Key extends 'page' ? Route : Value[Key]
  }
}
