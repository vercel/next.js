import { LRUCache } from '../../server/lib/lru-cache'
import { withPromiseCache } from '../../lib/with-promise-cache'
import { createHash } from 'crypto'
import { loadBindings, parse } from '../swc'

/**
 * Parses a module with SWC using an LRU cache where the parsed module will
 * be indexed by a sha of its content holding up to 500 entries.
 */
export const parseModule = withPromiseCache(
  new LRUCache<any>(500),
  async (filename: string, content: string) => {
    // Segment config is needed before loaders run to select the runtime. MDX
    // must be compiled first, rather than parsed as JavaScript or scanned with
    // a regexp that could mistake fenced code blocks for actual exports.
    if (filename.endsWith('.mdx')) {
      const bindings = await loadBindings()
      try {
        content = await bindings.mdx.compile(content, { filepath: filename })
      } catch {
        // Let the MDX loader report syntax errors, just as for JavaScript below.
        return null
      }
    }
    return parse(content, { isModule: 'unknown', filename }).catch(() => null)
  },
  (filename, content) =>
    createHash('sha1')
      .update(filename.endsWith('.mdx') ? 'mdx' : 'js')
      .update(content)
      .digest('hex')
)
