import { GetStaticPaths, GetStaticProps, InferGetStaticPropsType } from "next";
import Error from "next/error";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import saleor from "../../data/saleor";
import styles from "../../styles/Home.module.css";

export const getStaticProps: GetStaticProps = async ({ params: { id } }) => {
  const { api } = await saleor.connect();
  const { data: category } = await api.categories.getDetails({
    id: id.toString(),
  });
  const { data: products } = await api.products.getList({
    filter: {
      categories: [category.id],
    },
    first: 100,
  });
  return { props: { category, products }, revalidate: 5 };
};

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    fallback: true,
    paths: [],
  };
};

export default function Category({
  category,
  products,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const { isFallback } = useRouter();
  if (isFallback && !category) {
    return "Loading...";
  }
  if (!category) {
    return <Error statusCode={404} title="Category not found" />;
  }
  return (
    <div className={styles.container}>
      <Head>
        <title>Category Details: {category.name}</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <h1 className={styles.title}>{category.name}</h1>
        <img
          src={category.backgroundImage.url}
          alt={category.backgroundImage.alt}
        />
        <div className={styles.grid}>
          {products?.map(product => (
            <div key={product.id} className={styles.card}>
              <h3>
                <Link href={`/product/${product.slug}`}>{product.name}</Link>
              </h3>
              <p>{product.seoDescription}</p>
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
