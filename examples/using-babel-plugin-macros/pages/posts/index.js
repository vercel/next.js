import Link from 'next/link'

// import-all.macro is one of a growing list of many macros that you can install
// from npm https://www.npmjs.com/search?q=keywords:babel-plugin-macros
// remember that these run at compile time. This particular macro is built to
// generate import statements for all files that match a given glob.
import importAll from 'import-all.macro'

const allPosts = importAll.sync('./post-*.js')

export default () => (
  <div>
    <h1>
      Posts loaded with{' '}
      <a href='https://www.npmjs.com/package/import-all.macro'>
        import-all.macro!
      </a>
    </h1>
    <ul>
      {Object.keys(allPosts).map(filename => (
        <li key={filename}>
          <Link href={`/posts/${filename.slice(0, -3)}`}>
            <a>{allPosts[filename].title}</a>
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
import-all.macro compiles the above code to roughly:

...
import * as _a from './post-1'
import * as _b from './post-2'

const allPosts = {
  'post-1.js': _a,
  'post-2.js': _b
}
...
*/
