import Link from 'next/link';
import useSWR from 'swr';
import { useUser } from '../lib/hooks';

function Navbar() {
    const [user, { mutate }] = useUser();
    async function handleLogout() {
        await fetch('/api/logout');
        mutate(null);
    }

    return (
        <>
        <style jsx>{`
        nav {
          max-width: 1040px;
          margin: auto;
          padding: 1rem 2rem;
          border-bottom: 1px solid #d8d8d8;
        }
        nav div {
          float: right;
        }
        nav div a {
          font-size: 0.9rem;
          margin-left: 1rem;
        }
        nav h1 {
          font-size: 1rem;
          color: #444;
          margin: 0;
          font-weight: 700;
          float: left;
        }
        nav:after {
          content: '';
          clear: both;
          display: table;
        }
        `}</style>
    <nav>
      <Link href="/">
        <a>Next.js CRUD</a>
      </Link>
      <div>
        {!user ? (
          <Link href="/login">
          <a>Sign in</a>
        </Link>
        ) : (
            <a role="button" onClick={handleLogout}>
            Logout
        </a>
        )}
      </div>
    </nav></>)
}

export default function Layout({ children }) {
    return <>
        <Navbar />
        <main>{children}</main>
    </>
}