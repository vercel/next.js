export default function getPaths(pathPrefix) {
  return [
    // this will get turned into %2Fmy-post%2F
    { params: { slug: '/my-post/' } },
    // this will get turned into %252Fmy-post%252F
    { params: { slug: '%2Fmy-post%2F' } },
    // this will be passed through
    { params: { slug: '+my-post+' } },
    // this will get turned into %3Fmy-post%3F
    { params: { slug: '?my-post?' } },
    // ampersand signs
    { params: { slug: '&my-post&' } },
    // non-ascii characters
    { params: { slug: '商業日語' } },
    { params: { slug: ' my-post ' } },
    { params: { slug: encodeURIComponent('商業日語') } },
    `${pathPrefix}/%2Fsecond-post%2F`,
    `${pathPrefix}/%2Bsecond-post%2B`,
    `${pathPrefix}/%26second-post%26`,
    `${pathPrefix}/mixed-${encodeURIComponent('商業日語')}`,
  ]
}
