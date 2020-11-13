export default [
  { params: { slug: '/my-post/' } }, // this will get turned into %2Fmy-post%2F
  { params: { slug: '%2Fmy-post%2F' } }, // this will be passed through
  { params: { slug: '+my-post+' } }, // this will be passed through
  { params: { slug: '?my-post?' } }, // this will get turned into %3Fmy-post%3F
  { params: { slug: '&my-post&' } }, // ampersand signs
  { params: { slug: '商業日語' } }, /// non-ascii characters
]
