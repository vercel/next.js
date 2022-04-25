import Link from 'next/link'

function Comp({children}) {
    return children
} 

export default function Page() {
    return (
        <Link href="/" oldBehavior>
            <Comp>Home</Comp>
        </Link>
    );
}