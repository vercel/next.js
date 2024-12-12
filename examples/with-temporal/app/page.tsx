// app/page.jsx or pages/index.jsx
import Link from "next/link";
import Layout from "../components/Layout";
import CreateOrderButton from "../components/CreateOrderButton";

const IndexPage = () => (
  <Layout title="Home | Next.js + Temporal Example">
    <h1>Hello Next.js 👋</h1>
    <CreateOrderButton />
    <p>
      <Link href="/about">About</Link>
    </p>
  </Layout>
);

export default IndexPage;
