import Link from 'next/link'

const linkProps = {}

export default function Page() {
    return <Link href="/about"><a className="link" {...linkProps}>about</a></Link>;
}

