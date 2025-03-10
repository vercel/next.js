import Link from 'next/link'

export default function Nav() {
  return (
    <>
      <h3>App</h3>
      <ul>
        <li>
          <Link href={'/first'} id="first">
            First
          </Link>
        </li>
        <li>
          <Link href={'/first-client'} id="first-client">
            First client
          </Link>
        </li>
        <li>
          <Link href={'/second'} id="second">
            Second
          </Link>
        </li>
        <li>
          <Link href={'/second-client'} id="second-client">
            Second client
          </Link>
        </li>
        <li>
          <Link href={'/third'} id="third">
            Third
          </Link>
        </li>
        <li>
          <Link href={'/interleaved/a'} id="interleaved-a">
            Interleaved A
          </Link>
        </li>
        <li>
          <Link href={'/interleaved/b'} id="interleaved-b">
            Interleaved B
          </Link>
        </li>
        <li>
          <Link href={'/big-interleaved/a'} id="big-interleaved-a">
            Big Interleaved A
          </Link>
        </li>
        <li>
          <Link href={'/big-interleaved/b'} id="big-interleaved-b">
            Big Interleaved B
          </Link>
        </li>
        <li>
          <Link href={'/reversed/a'} id="reversed-a">
            Reversed A
          </Link>
        </li>
        <li>
          <Link href={'/reversed/b'} id="reversed-b">
            Reversed B
          </Link>
        </li>
        <li>
          <Link href={'/partial-reversed/a'} id="partial-reversed-a">
            Partial Reversed A
          </Link>
        </li>
        <li>
          <Link href={'/partial-reversed/b'} id="partial-reversed-b">
            Partial Reversed B
          </Link>
        </li>
        <li>
          <Link href={'/global-first'} id="global-first">
            Global First
          </Link>
        </li>
        <li>
          <Link href={'/global-second'} id="global-second">
            Global Second
          </Link>
        </li>
        <li>
          <Link href={'/vendor'} id="vendor">
            Vendor
          </Link>
        </li>
      </ul>
      <h3>Pages</h3>
      <ul>
        <li>
          <Link href={'/pages/first'} id="pages-first">
            First
          </Link>
        </li>
        <li>
          <Link href={'/pages/second'} id="pages-second">
            Second
          </Link>
        </li>
        <li>
          <Link href={'/pages/third'} id="pages-third">
            Third
          </Link>
        </li>
        <li>
          <Link href={'/pages/interleaved/a'} id="pages-interleaved-a">
            Interleaved A
          </Link>
        </li>
        <li>
          <Link href={'/pages/interleaved/b'} id="pages-interleaved-b">
            Interleaved B
          </Link>
        </li>{' '}
        <li>
          <Link href={'/pages/reversed/a'} id="pages-reversed-a">
            Reversed A
          </Link>
        </li>
        <li>
          <Link href={'/pages/reversed/b'} id="pages-reversed-b">
            Reversed B
          </Link>
        </li>
        <li>
          <Link
            href={'/pages/partial-reversed/a'}
            id="pages-partial-reversed-a"
          >
            Partial Reversed A
          </Link>
        </li>
        <li>
          <Link
            href={'/pages/partial-reversed/b'}
            id="pages-partial-reversed-b"
          >
            Partial Reversed B
          </Link>
        </li>
      </ul>
    </>
  )
}
