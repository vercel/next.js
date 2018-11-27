import Link from 'next/link'
export default () => (
  <div>
    <h1>Hello World.</h1>
    <ol>
      <li><Link href='/about'><a>About</a></Link></li>
      <li><Link href='/withQuery?some=query&in=here'><a>About 2: A link with query</a></Link></li>
      <li><Link href='/day'><a>Day: A folder with index.js</a></Link></li>
    </ol>
  </div>
)
