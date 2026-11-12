import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// Digests of the prerendered output (HTML, RSC, segment data, metadata), so
// runs with different scheduler settings can be checked for identical output.
//
// `digest` hashes the raw bytes. `normalizedDigest` sorts the rows of each
// RSC payload first (inline `self.__next_f` rows in HTML, lines in `.rsc`
// files). Row order depends on render timing: a fetch that hits the cache
// resolves sooner than one that misses, which moves its row in the stream.
// Which pages hit the cache depends on which worker rendered which page, so
// the raw digest changes whenever page placement changes, even though the
// content is the same.
const FLIGHT_PUSH =
  /<script>self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g

function normalize(file, buffer) {
  if (file.endsWith('.rsc')) {
    return buffer.toString('utf8').split('\n').sort().join('\n')
  }
  if (file.endsWith('.html')) {
    const html = buffer.toString('utf8')
    let rows = ''
    const rest = html.replace(FLIGHT_PUSH, (_, literal) => {
      rows += JSON.parse(literal)
      return ''
    })
    return rest + '\n' + rows.split('\n').sort().join('\n')
  }
  return buffer
}

export function outputDigest(distDir) {
  const roots = ['server/app', 'server/pages'].map((p) => path.join(distDir, p))
  const raw = []
  const normalized = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (!/\.(js|map|nft\.json)$|manifest/.test(entry.name)) {
        const rel = path.relative(distDir, full)
        const buffer = fs.readFileSync(full)
        const sha1 = (data) =>
          crypto.createHash('sha1').update(data).digest('hex')
        raw.push(`${rel} ${sha1(buffer)}`)
        normalized.push(`${rel} ${sha1(normalize(entry.name, buffer))}`)
      }
    }
  }
  roots.forEach(walk)
  const combine = (entries) =>
    crypto
      .createHash('sha1')
      .update(entries.sort().join('\n'))
      .digest('hex')
      .slice(0, 12)
  return {
    files: raw.length,
    digest: combine(raw),
    normalizedDigest: combine(normalized),
  }
}

// `node output-digest.mjs <distDir>` prints the digests of a build.
if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  console.log(outputDigest(process.argv[2] ?? '.next'))
}
