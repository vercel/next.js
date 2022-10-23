import Link from 'next/link'
export default function Page() {
    return (
        <Link href="/about">
            <a onClick={() => {
                console.log('clicked')
            }} download>Link</a>
        </Link>
    )
}