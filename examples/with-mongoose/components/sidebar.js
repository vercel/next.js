import Link from 'next/link'

const SideBar = () => (
  <aside className="col-md-4 blog-sidebar">
    <div className="p-4">
      <h4 className="font-italic">Archives</h4>
      <ol className="list-unstyled mb-0">
        <li>
          <Link href="/">
            <a>
              <time>March 2014</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>February 2014</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>January 2014</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>December 2013</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>November 2013</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>October 2013</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>September 2013</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>August 2013</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>July 2013</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>June 2013</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>May 2013</time>
            </a>
          </Link>
        </li>
        <li>
          <Link href="/">
            <a>
              <time>April 2013</time>
            </a>
          </Link>
        </li>
      </ol>
    </div>
  </aside>
)

export default SideBar
