import Link from 'next/link'

export default function CustomLink({ href, ...otherProps }) {
  return (
    <>
      <Link href={href}>
        <a {...otherProps} />
      </Link>
      <style jsx>{`
        a {
          color: tomato;
        }
      `}</style>
    </>
  )
}
