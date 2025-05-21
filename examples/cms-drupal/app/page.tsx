import Container from "@/components/container";
import MoreStories from "@/components/more-stories";
import HeroPost from "@/components/hero-post";
import Intro from "@/components/intro";
import Layout from "@/components/layout";
import { absoluteURL } from "@/lib/api";
import { drupal } from "@/lib/drupal";

export default async function Home() {
  const posts = await drupal.getResourceCollection("node--article", {
    params: {
      include: "field_image,uid, uid.user_picture",
      sort: "-created",
    },
  });

  const heroPost = posts[0];
  const morePosts = posts.slice(1);

  return (
    <Layout preview={false}>
      <Container>
        <Intro />
        {heroPost && (
          <HeroPost
            title={heroPost.title}
            coverImage={{
              sourceUrl: absoluteURL(heroPost.field_image.uri.url),
            }}
            date={heroPost.created}
            author={{
              name: heroPost.uid.display_name,
              avatar: {
                url: absoluteURL(heroPost.uid.user_picture.uri.url),
              },
            }}
            slug={heroPost.path.alias}
            excerpt={heroPost.body.summary}
          />
        )}
        {morePosts.length > 0 && <MoreStories posts={morePosts} />}
      </Container>
    </Layout>
  );
}
