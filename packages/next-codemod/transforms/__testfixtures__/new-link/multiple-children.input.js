import Link from 'next/link'

export default function Page() {
    return (
        <Link href="/about">
            <a id="about">
                <h3>About Us</h3>
                <p>Learn more</p>
            </a>
        </Link>
    );
}