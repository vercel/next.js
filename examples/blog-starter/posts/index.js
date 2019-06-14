import preval from 'babel-plugin-preval/macro'

/**
 * The preval plugin pre-evaluates code at build time. We use this to get the
 * meta from the MDX files (blog posts) and use it for displaying the list of
 * posts in the `index.js` page
 *
 * This code is not used in the browser or the app at all, but only in build
 * time when Node is available.
 */

const posts = preval`
    module.exports = require('./get-blog-posts.js');
`

module.exports = posts
