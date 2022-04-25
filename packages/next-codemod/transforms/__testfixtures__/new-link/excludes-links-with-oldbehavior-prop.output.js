import Link from 'next/link'

export default function Page() {
    return (
        <Link href="/" oldBehavior>
            <a>Home</a>
        </Link>
    )
}