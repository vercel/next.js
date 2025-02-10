import { flotiqApiClient } from "@/flotiq-api-client";
import BlogPostCard from "./_components/BlogPostCard/BlogPostCard";
import PageSummary from "./_components/PageSummary/PageSummary";

export default async function Home() {
  const posts = await flotiqApiClient.content.blogpost.list({
    limit: 10,
    hydrate: 1,
    orderDirection: "desc",
    orderBy: "internal.createdAt",
  });

  return (
    <div className="flex flex-col gap-10">
      <PageSummary
        title="Hi, I'm Jane Doe!"
        description={
          <>
            I&apos;m a passionate blogger who loves sharing my journey and
            insights with the world. I have a keen interest in web development
            and I&apos;m always exploring new techniques and trends to create
            stunning websites. When I&apos;m not coding or writing about my
            latest projects, you&apos;ll find me indulging in my favorite hobby
            – crocheting. My blog is a delightful mix of tech tutorials and
            creative crochet patterns, making it a unique space for both tech
            enthusiasts and craft lovers alike. Join me as I weave together my
            love for technology and creativity, one blog post at a time.
          </>
        }
        imageUrl="/assets/author.png"
        imageAlt="Jane Doe"
      />
      {posts.data.map((post) => (
        <BlogPostCard key={post.id} {...post} />
      ))}
    </div>
  );
}
