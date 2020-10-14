import { GetStaticPaths, GetStaticProps, InferGetStaticPropsType } from "next";
import Error from "next/error";
import Head from "next/head";
import { useRouter } from "next/router";
import saleor from "../../data/saleor";
import styles from "../../styles/Home.module.css";

export const getStaticProps: GetStaticProps = async ({ params: { slug } }) => {
  const { api } = await saleor.connect();
  const { data: product } = await api.products.getDetails({
    slug: slug.toString(),
  });
  return { props: { product }, revalidate: 5 };
};

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    fallback: true,
    paths: [],
  };
};

export default function Category({
  product,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const { isFallback } = useRouter();
  if (isFallback && !product) {
    return "Loading...";
  }
  if (!product) {
    return <Error statusCode={404} title="Product not found" />;
  }
  return (
    <div className={styles.container}>
      <Head>
        <title>Product Details: {product.name}</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <h1 className={styles.title}>{product.name}</h1>
        <div className={styles.grid}>
          {product.images?.map((image, index) => (
            <img key={index} src={image.url} alt={image.alt} />
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
