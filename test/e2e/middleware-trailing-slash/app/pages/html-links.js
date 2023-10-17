import Link from 'next/link'

export default function Page() {
  return (
    <ul>
      <li>
        <Link
          id="with-html"
          href="/product/shirts_and_tops/mens_ua_playoff_polo_2.0/1327037.html"
        >
          Does not work
        </Link>
      </li>
      <li>
        <Link
          id="without-html"
          href="/product/shirts_and_tops/mens_ua_playoff_polo_2.0/1327037"
        >
          Works
        </Link>
      </li>
    </ul>
  )
}
