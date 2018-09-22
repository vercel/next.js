import Link from 'next/link'
export default () => (
  <div>
    Hello World.{' '}
    <ul>
      <li>
        <Link href='/posts'>
          <a>Posts with import-all.macro</a>
        </Link>
      </li>
      <li>
        <Link href='/posts-custom'>
          <a>Posts with custom macro</a>
        </Link>
      </li>
    </ul>
  </div>
)
