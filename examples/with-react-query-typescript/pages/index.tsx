import Link from "next/link";
import Layout from "../components/Layout";

const IndexPage = () => (
  <>
    <h1>Hello Next.js 👋</h1>
    <p>Nextjs react-query example in typescript</p>
    <Link href="/posts">Go to posts</Link>
  </>
);

export default IndexPage;
