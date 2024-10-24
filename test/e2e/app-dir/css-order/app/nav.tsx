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
        <li>
          <Link href={'/vendor/a'} id="vendor-a">
            Vendor Side Effects All CSS Array
          </Link>
        </li>
        <li>
          <Link href={'/vendor/e'} id="vendor-e">
            Vendor Side Effects All CSS Array - Client Components
          </Link>
        </li>
        <li>
          <Link href={'/vendor/f'} id="vendor-f">
            Vendor Side Effects All CSS Array - Server Component With Client
            Subcomponent
          </Link>
        </li>
        <li>
          <Link href={'/vendor/b'} id="vendor-b">
            Vendor Side Effects True
          </Link>
        </li>
        <li>
          <Link href={'/vendor/g'} id="vendor-g">
            Vendor Side Effects True - Client Components
          </Link>
        </li>
        <li>
          <Link href={'/vendor/h'} id="vendor-h">
            Vendor Side Effects True - Server Component With Client Subcomponent
          </Link>
        </li>
        <li>
          <Link href={'/vendor/c'} id="vendor-c">
            Vendor Side Effects False - Client Components
          </Link>
        </li>
        <li>
          <Link href={'/vendor/i'} id="vendor-i">
            Vendor Side Effects False
          </Link>
        </li>
        <li>
          <Link href={'/vendor/j'} id="vendor-j">
            Vendor Side Effects False - Server Component With Client
            Subcomponent
          </Link>
        </li>
        <li>
          <Link href={'/vendor/d'} id="vendor-d">
            Vendor Side Effects Global CSS Only Array
          </Link>
        </li>
        <li>
          <Link href={'/vendor/k'} id="vendor-k">
            Vendor Side Effects Global CSS Only Array - Client Components
          </Link>
        </li>
        <li>
          <Link href={'/vendor/l'} id="vendor-l">
            Vendor Side Effects Global CSS Only Array - Server Component With
            Client Subcomponent
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
        <li>
          <Link href={'pages/vendor/a'} id="pages-vendor-a">
            Vendor Side Effects All CSS Array
          </Link>
        </li>
        <li>
          <Link href={'pages/vendor/b'} id="pages-vendor-b">
            Vendor Side Effects True
          </Link>
        </li>
        <li>
          <Link href={'pages/vendor/c'} id="pages-vendor-c">
            Vendor Side Effects False
          </Link>
        </li>
        <li>
          <Link href={'pages/vendor/d'} id="pages-vendor-d">
            Vendor Side Effects Global CSS Only Array
          </Link>
        </li>
      </ul>
    </>
  )
}
