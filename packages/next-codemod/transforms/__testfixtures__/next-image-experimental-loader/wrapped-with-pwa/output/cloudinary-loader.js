const normalizeSrc = (src) => src[0] === '/' ? src.slice(1) : src
export default function cloudinaryLoader({ src, width, quality }) {
const params = ['f_auto', 'c_limit', 'w_' + width, 'q_' + (quality || 'auto')]
const paramsString = params.join(',') + '/'
return 'https://example.com/' + paramsString + normalizeSrc(src)
}