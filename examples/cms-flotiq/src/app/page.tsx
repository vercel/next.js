import Image from "next/image";

import { flotiqApiClient } from "@/flotiq-api-client";

import BlogPostCard from "./_components/BlogPostCard/BlogPostCard";

export default async function Home() {
  const posts = await flotiqApiClient.content.blogpost.list({
    limit: 10,
    hydrate: 1,
    orderDirection: "desc",
    orderBy: "internal.createdAt",
  });

  return (
    <>
      <div
        className="flex flex-col md:flex-row items-start md:items-center
                  mt-9 mb-16 lg:my-20 2xl:my-32 mx-auto gap-4 md:gap-0"
      >
        <div className="w-full md:w-60 xl:w-80 shrink-0">
          <Image
            className="rounded-full h-auto w-40 m-auto"
            alt="Jane Doe"
            src="/assets/author.png"
            width={160}
            height={160}
          />
        </div>
        <div className="my-auto md:px-8">
          <h1 className="text-center md:text-left">Hi, I&apos;m Jane Doe!</h1>
          <p>
            I&apos;m a passionate blogger who loves sharing my journey and
            insights with the world. I have a keen interest in web development
            and I&apos;m always exploring new techniques and trends to create
            stunning websites. When I&apos;m not coding or writing about my
            latest projects, you&apos;ll find me indulging in my favorite hobby
            – crocheting. My blog is a delightful mix of tech tutorials and
            creative crochet patterns, making it a unique space for both tech
            enthusiasts and craft lovers alike. Join me as I weave together my
            love for technology and creativity, one blog post at a time.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-12">
        {posts.data.map((post) => (
          <BlogPostCard key={post.id} {...post} />
        ))}
      </div>
    </>
  );
}
