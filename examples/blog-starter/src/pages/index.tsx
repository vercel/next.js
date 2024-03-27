import Link from 'next/link';
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-between p-24 ${inter.className}`}>
      <h1>Welcome to My Blog</h1>
      <p>Check out our latest blog post:</p>
      <Link href="/blog/new-blog-post">New Blog Post
      </Link>
      <br />
      <Link href="/blog/api-blog-post">API Blog Post
      </Link>
    </main>
  );
}
