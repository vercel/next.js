import Link from 'next/link'

export default function ShallowLayout({ children }) {
  return (
    <>
      <h1>Shallow Routing</h1>
      <div>
        <div>
          <Link href="/a" id="to-a">
            To A
          </Link>
        </div>
        <div>
          <a href="/a" id="to-a-mpa">
            To A MPA Navigation
          </a>
        </div>
        <div>
          <Link href="/b" id="to-b">
            To B
          </Link>
        </div>
        <div>
          <a href="/b" id="to-b-mpa">
            To B MPA Navigation
          </a>
        </div>
        <div>
          <Link href="/dynamic/1" id="to-dynamic-1">
            To Dynamic 1
          </Link>
        </div>
        <div>
          <Link href="/dynamic/2" id="to-dynamic-2">
            To Dynamic 2
          </Link>
        </div>
        <div>
          <Link href="/pushstate-data" id="to-pushstate-data">
            To PushState Data
          </Link>
        </div>
        <div>
          <Link
            href="/pushstate-new-searchparams"
            id="to-pushstate-new-searchparams"
          >
            To PushState new SearchParams
          </Link>
        </div>
        <div>
          <Link href="/pushstate-new-pathname" id="to-pushstate-new-pathname">
            To PushState new pathname
          </Link>
        </div>
        <div>
          <Link href="/pushstate-string-url" id="to-pushstate-string-url">
            To PushState String Url
          </Link>
        </div>
        <div>
          <Link href="/replacestate-data" id="to-replacestate-data">
            To ReplaceState Data
          </Link>
        </div>
        <div>
          <Link
            href="/replacestate-new-searchparams"
            id="to-replacestate-new-searchparams"
          >
            To ReplaceState new SearchParams
          </Link>
        </div>
        <div>
          <Link
            href="/replacestate-new-pathname"
            id="to-replacestate-new-pathname"
          >
            To ReplaceState new pathname
          </Link>
        </div>
        <div>
          <Link href="/replacestate-string-url" id="to-replacestate-string-url">
            To ReplaceState String Url
          </Link>
        </div>
      </div>
      {children}
    </>
  )
}
