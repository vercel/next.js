import { GetStaticPaths, GetStaticProps, InferGetStaticPropsType } from "next";
import Head from "next/head";
import Link from "next/link";
import styles from "../styles/Home.module.css";
import saleor from "../data/saleor";

export const getStaticProps: GetStaticProps = async () => {
  const { api } = await saleor.connect();
  const { data: categories } = await api.categories.getList({ first: 10 });

  return { props: { categories }, revalidate: 5 };
};

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    fallback: false,
    paths: ["/"],
  };
};

export default function Home({
  categories,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div className={styles.container}>
      <Head>
        <title>Saleor Next.js Demo</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <h1 className={styles.title}>
          Welcome to <a href="https://nextjs.org">Next.js!</a>
        </h1>
        <div className={styles.grid}>
          {categories?.map(category => (
            <div key={category.id} className={styles.card}>
              <h3>
                <Link href={`/category/${category.id}`}>{category.name}</Link>
              </h3>
              <p>{category.seoDescription}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className={styles.footer}>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{" "}
          <img src="/vercel.svg" alt="Vercel Logo" className={styles.logo} />
        </a>
      </footer>
    </div>
  );
}
