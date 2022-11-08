import Link from 'next/link'

function Comp({children}) {
    return children
} 

const a = <Comp />

export default function Page() {
    return (
        <Link href="/about">
            {a}
        </Link>
    );
}

