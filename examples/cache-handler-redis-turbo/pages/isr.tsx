import Link from "next/link";
import type { GetStaticProps, InferGetStaticPropsType } from "next";

export const getStaticProps = (async () => ({
  props: { generatedAt: new Date().toISOString() },
  revalidate: 10,
})) satisfies GetStaticProps<{ generatedAt: string }>;

export default function IsrPage({
  generatedAt,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <header className="header">
        <Link className="link" href="/">
          &larr; Home
        </Link>
      </header>
      <main className="widget">
        <h1>ISR via the singular cacheHandler</h1>
        <p>Generated at: {generatedAt}</p>
        <p>Regenerates after 10 seconds.</p>
      </main>
    </>
  );
}
