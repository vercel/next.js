import Link from 'next/link'
export default function SomeRoute() {
  return (
    <div>
      <p>This is some route</p>
      <Link id="shallow-link" shallow href="/some-route?xyz=world">
        Click this link twice
      </Link>
    </div>
  )
}
