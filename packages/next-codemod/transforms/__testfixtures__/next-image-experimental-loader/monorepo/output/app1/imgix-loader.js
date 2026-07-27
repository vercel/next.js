const normalizeSrc = (src) => src[0] === '/' ? src.slice(1) : src
export default function imgixLoader({ src, width, quality }) {
const url = new URL('https://example.com/' + normalizeSrc(src))
const params = url.searchParams
params.set('auto', params.getAll('auto').join(',') || 'format')
params.set('fit', params.get('fit') || 'max')
params.set('w', params.get('w') || width.toString())
if (quality) { params.set('q', quality.toString()) }
return url.href
}