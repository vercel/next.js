import Link from 'next/link'

const linkProps = {}

export default function Page() {
    return <Link href="/about" className="link" {...linkProps}>about</Link>;
}
