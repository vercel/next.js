import type { NextPage } from "next";
import Link from "next/link";
import Layout from "../components/Layout";

const AboutPage: NextPage = () => (
  <Layout title="About | Next.js + Temporal Example">
    <h1>About</h1>
    <p>This is the about page</p>
    <p>
      <Link href="/">Go home</Link>
    </p>
  </Layout>
);

export default AboutPage;
