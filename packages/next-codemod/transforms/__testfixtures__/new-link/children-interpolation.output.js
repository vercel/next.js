import Link from 'next/link'

function Comp({children}) {
    return children
} 

const c = <Comp />

export default function Page() {
    return (
        (<Link href="/about">
            {/* @next-codemod-error This Link previously used the now removed `legacyBehavior` prop, and has a child that might not be an anchor. The codemod bailed out of lifting the child props to the Link. Check that the child component does not render an anchor, and potentially move the props manually to Link. */
            }
            {c}
        </Link>)
    );
}

