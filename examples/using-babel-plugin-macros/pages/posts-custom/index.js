import Link from 'next/link'

// the import-all.macro that we're using in /posts is cool, but the drawback is
// that we're literally including all of the data/code for all the posts in that
// file which may not be what we want.
//
// So let's write our own macro that's specific for our use case which will
// replace all instances of `allPosts` with only data we need for this page
// (path, and title).
import allPosts from './import-posts.macro'

export default () => (
  <div>
    <h1>Posts loaded with a custom macro!</h1>
    <ul>
      {allPosts.map(({title, filename}) => (
        <li key={filename}>
          <Link href={`/posts-custom/${filename}`}>
            <a>{title}</a>
          </Link>
        </li>
      ))}
    </ul>
    <Link href='/'>
      <a>Home</a>
    </Link>
  </div>
)

/*
Our macro compiles the above code to roughly:

...
var _temp = [
  {title: 'First post', path: 'post-1.js'},
  {title: 'Second post', path: 'post-2.js'},
]
...
    <ul>
      {_temp.map(({title, filename}) => (
        <li key={filename}>
...

Doing it this way helps to reduce the bundle size of the app while still getting
the benefit of dynamically requiring all the posts in this directory.
*/
