import Link from 'next/link'

export default function Page() {
    return (
        <>
            <Link href="/" legacyBehavior>
                <a>Foo</a>
            </Link>
            <Link href="/" legacyBehavior passHref>
                <a>Bar</a>
            </Link>
        </>
    )
}