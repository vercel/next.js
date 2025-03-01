import { notFound } from "next/navigation";
import { CustomMDX } from "@/components/mdx";
import { getPosts } from "@/lib/utils";
import styles from "./page.module.css";
import Link from "next/link";

export function generateStaticParams() {
  const posts = getPosts();

  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export default async function Blog({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = (await params).slug;
  const post = getPosts().find((post) => post.slug === slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <header>
        <nav>
          <Link href="/">👈 Go back home</Link>
        </nav>
      </header>
      <main>
        <h1 className={styles.postHeader}>{post.metadata.title}</h1>
        {post.metadata.description && (
          <p className={styles.description}>{post.metadata.description}</p>
        )}
        <article>
          <CustomMDX source={post.content} />
        </article>
      </main>
    </>
  );
}
