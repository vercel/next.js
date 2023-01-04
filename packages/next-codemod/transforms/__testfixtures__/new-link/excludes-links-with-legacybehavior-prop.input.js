import Link from 'next/link'

export default function Page() {
    return (
        <Link href="/" legacyBehavior>
            <a>Home</a>
        </Link>
    )
}