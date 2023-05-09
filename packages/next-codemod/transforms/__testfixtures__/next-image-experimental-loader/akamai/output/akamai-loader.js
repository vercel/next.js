const normalizeSrc = (src) => src[0] === '/' ? src.slice(1) : src
export default function akamaiLoader({ src, width, quality }) {
return 'https://example.com/' + normalizeSrc(src) + '?imwidth=' + width
}