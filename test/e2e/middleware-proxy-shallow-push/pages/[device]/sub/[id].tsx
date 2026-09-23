import Link from 'next/link'

export default function Sub() {
  return (
    <div>
      <p>This is a sub page</p>
      <Link id="shallow-link" shallow href="/sub/100?xyz=world">
        Click this link twice
      </Link>
    </div>
  )
}
