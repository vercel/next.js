// This app is a collection of statically built pages designed to be served on a CDN. In a CDN, the
// directory structure determines routes. Below is a typical directory structure for a static
// website.
//
// my-website/
//   javascript/
//     ├── main-bundle.js
//     └── vendor.js
//   account/
//     └── index.html
//   post-details/
//     └── index.html
//   post-search/
//     └── index.html
//   index.html
//
// For this website, you'll have the routes:
//
// https://my-website.com/
// https://my-website.com/account/
// https://my-website.com/post-details/
// https://my-website.com/post-search/
//
// For a static website with dynamic routes like
// https://my-website.com/posts/:postId, you need to add redirect rules. The tuples below map the
// external URLs to the static pages in the CDN. This file is used to generate the Next.js server
// routes, the URL parameters used to load page data and to generate our CDN's redirect rules.

// prettier-ignore
module.exports = [
  { externalURL: `/posts/:postId`, staticPage: `/post` },
  { externalURL: `/posts`, staticPage: `/posts` }
]
