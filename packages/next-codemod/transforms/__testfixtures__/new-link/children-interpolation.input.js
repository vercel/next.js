import Link from 'next/link'

function Comp({children}) {
    return children
} 

const c = <Comp />

export default function Page() {
    return (
        <Link href="/about" legacyBehavior>
            {c}
        </Link>
    );
}

