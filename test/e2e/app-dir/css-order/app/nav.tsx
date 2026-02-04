import Link from 'next/link'

export default function Nav() {
  return (
    <>
      <h3>App</h3>
      <ul>
        <li>
          <Link href={'/first'} id="first" prefetch={false}>
            First
          </Link>
        </li>
        <li>
          <Link href={'/first-client'} id="first-client" prefetch={false}>
            First client
          </Link>
        </li>
        <li>
          <Link href={'/second'} id="second" prefetch={false}>
            Second
          </Link>
        </li>
        <li>
          <Link href={'/second-client'} id="second-client" prefetch={false}>
            Second client
          </Link>
        </li>
        <li>
          <Link href={'/third'} id="third" prefetch={false}>
            Third
          </Link>
        </li>
        <li>
          <Link href={'/interleaved/a'} id="interleaved-a" prefetch={false}>
            Interleaved A
          </Link>
        </li>
        <li>
          <Link href={'/interleaved/b'} id="interleaved-b" prefetch={false}>
            Interleaved B
          </Link>
        </li>
        <li>
          <Link
            href={'/big-interleaved/a'}
            id="big-interleaved-a"
            prefetch={false}
          >
            Big Interleaved A
          </Link>
        </li>
        <li>
          <Link
            href={'/big-interleaved/b'}
            id="big-interleaved-b"
            prefetch={false}
          >
            Big Interleaved B
          </Link>
        </li>
        <li>
          <Link href={'/reversed/a'} id="reversed-a" prefetch={false}>
            Reversed A
          </Link>
        </li>
        <li>
          <Link href={'/reversed/b'} id="reversed-b" prefetch={false}>
            Reversed B
          </Link>
        </li>
        <li>
          <Link
            href={'/partial-reversed/a'}
            id="partial-reversed-a"
            prefetch={false}
          >
            Partial Reversed A
          </Link>
        </li>
        <li>
          <Link
            href={'/partial-reversed/b'}
            id="partial-reversed-b"
            prefetch={false}
          >
            Partial Reversed B
          </Link>
        </li>
        <li>
          <Link href={'/global-first'} id="global-first" prefetch={false}>
            Global First
          </Link>
        </li>
        <li>
          <Link href={'/global-second'} id="global-second" prefetch={false}>
            Global Second
          </Link>
        </li>
        <li>
          <Link href={'/vendor'} id="vendor" prefetch={false}>
            Vendor
          </Link>
        </li>
      </ul>
      <h3>Pages</h3>
      <ul>
        <li>
          <Link href={'/pages/first'} id="pages-first" prefetch={false}>
            First
          </Link>
        </li>
        <li>
          <Link href={'/pages/second'} id="pages-second" prefetch={false}>
            Second
          </Link>
        </li>
        <li>
          <Link href={'/pages/third'} id="pages-third" prefetch={false}>
            Third
          </Link>
        </li>
        <li>
          <Link
            href={'/pages/interleaved/a'}
            id="pages-interleaved-a"
            prefetch={false}
          >
            Interleaved A
          </Link>
        </li>
        <li>
          <Link
            href={'/pages/interleaved/b'}
            id="pages-interleaved-b"
            prefetch={false}
          >
            Interleaved B
          </Link>
        </li>{' '}
        <li>
          <Link
            href={'/pages/reversed/a'}
            id="pages-reversed-a"
            prefetch={false}
          >
            Reversed A
          </Link>
        </li>
        <li>
          <Link
            href={'/pages/reversed/b'}
            id="pages-reversed-b"
            prefetch={false}
          >
            Reversed B
          </Link>
        </li>
        <li>
          <Link
            href={'/pages/partial-reversed/a'}
            id="pages-partial-reversed-a"
            prefetch={false}
          >
            Partial Reversed A
          </Link>
        </li>
        <li>
          <Link
            href={'/pages/partial-reversed/b'}
            id="pages-partial-reversed-b"
            prefetch={false}
          >
            Partial Reversed B
          </Link>
        </li>
      </ul>
    </>
  )
}
