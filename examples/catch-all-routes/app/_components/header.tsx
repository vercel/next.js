import Link from "next/link";

const Header = () => (
  <header>
    <ul>
      <li>
        <Link href="/">Home</Link>
      </li>
      <li>
        <Link href="/about">About</Link>
      </li>
      <li>
        <Link
          href="/post/[...slug]"
          as="/post/2020/first-post/with/catch/all/routes"
        >
          First Post
        </Link>
      </li>
      <li>
        <Link
          href="/post/[...slug]"
          as="/post/2020/second-post/with/catch/all/routes"
        >
          Second Post
        </Link>
      </li>
    </ul>
  </header>
);

export default Header;
