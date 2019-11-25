import { Link } from '../routes'

export default () => (
  <>
    <Link route="/blog/first">
      <a>To /blog/first!</a>
    </Link>
    <br />
    <Link route="/user/zeit">
      <a>To /user/zeit!</a>
    </Link>
  </>
)
