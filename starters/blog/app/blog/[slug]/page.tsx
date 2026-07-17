import { Suspense } from "react";
import {
  PostDetail,
  PostDetailSkeleton,
} from "@/features/posts/components/post-detail";
import { getPost, getPosts } from "@/features/posts/posts-queries";

export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata(props: PageProps<"/blog/[slug]">) {
  const { slug } = await props.params;
  const post = await getPost(slug);
  return { title: post.title };
}

export default function PostPage({ params }: PageProps<"/blog/[slug]">) {
  return (
    <Suspense fallback={<PostDetailSkeleton />}>
      {params.then(({ slug }) => (
        <PostDetail slug={slug} />
      ))}
    </Suspense>
  );
}
