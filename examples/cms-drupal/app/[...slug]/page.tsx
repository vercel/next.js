import { notFound } from "next/navigation";
import { absoluteURL } from "@/lib/api";
import Layout from "@/components/layout";
import Container from "@/components/container";
import Header from "@/components/header";
import PostHeader from "@/components/post-header";
import PostBody from "@/components/post-body";
import SectionSeparator from "@/components/section-separator";
import MoreStories from "@/components/more-stories";
import { CMS_NAME } from "@/lib/constants";
import { drupal } from "@/lib/drupal";
import { Metadata } from "next";

type ArticlePageProps = {
  params: Promise<{
    slug: string[];
  }>;
};

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const path = drupal.constructPathFromSegment(slug);
  const post = await drupal.getResourceByPath(path, {
    params: {
      include: "field_image,uid,uid.user_picture",
    },
  });

  if (!post) {
    notFound();
  }

  const morePosts = await drupal.getResourceCollection("node--article", {
    params: {
      include: "field_image,uid,uid.user_picture",
      sort: "-created",
      "filter[id][condition][path]": "id",
      "filter[id][condition][operator]": "<>",
      "filter[id][condition][value]": post.id,
    },
  });

  return (
    <Layout preview={false}>
      <Container>
        <Header />
        <article>
          <PostHeader
            title={post.title}
            coverImage={{ sourceUrl: absoluteURL(post.field_image.uri.url) }}
            date={post.created}
            author={{
              name: post.uid.display_name,
              avatar: {
                url: absoluteURL(post.uid.user_picture.uri.url),
              },
            }}
            categories={[]}
            slug={path}
          />
          <PostBody content={post.body.processed} />
        </article>
        <SectionSeparator />
        {morePosts.length > 0 && <MoreStories posts={morePosts} />}
      </Container>
    </Layout>
  );
}

export async function generateStaticParams(): Promise<
  Array<{ slug: string[] }>
> {
  const resources =
    await drupal.getResourceCollectionPathSegments("node--article");

  return resources.map((resource) => ({
    slug: resource.segments,
  }));
}

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const path = drupal.constructPathFromSegment(slug);
  const post = await drupal.getResourceByPath(path);

  if (!post) {
    return {
      title: "Not Found",
      description: "The page could not be found",
    };
  }

  return {
    title: `${post.title} | Next.js Blog Example with ${CMS_NAME}`,
    description: post.body?.summary || "",
    openGraph: {
      images: post.field_image?.uri?.url
        ? [absoluteURL(post.field_image.uri.url)]
        : [],
    },
  };
}
