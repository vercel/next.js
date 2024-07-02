import { resizeImage } from "../../utils/image";
import request from "graphql-request";
import ErrorPage from "next/error";
import Head from "next/head";
import Link from "next/link";
import { Container } from "../../components/container";
import { AppProvider } from "../../components/contexts/appContext";
import { CoverImage } from "../../components/cover-image";
import { Footer } from "../../components/footer";
import { Layout } from "../../components/layout";
import { MarkdownToHtml } from "../../components/markdown-to-html";
import { PersonalHeader } from "../../components/personal-theme-header";
import {
  DraftByIdDocument,
  DraftByIdQuery,
  DraftByIdQueryVariables,
  Post as PostType,
  Publication,
  PublicationByHostDocument,
  PublicationByHostQuery,
  PublicationByHostQueryVariables,
} from "../../generated/graphql";

type Props = {
  post: PostType;
  publication: Publication;
};

export default function Post({ publication, post }: Props) {
  if (!post) {
    return <ErrorPage statusCode={404} />;
  }
  const highlightJsMonokaiTheme =
    ".hljs{display:block;overflow-x:auto;padding:.5em;background:#23241f}.hljs,.hljs-subst,.hljs-tag{color:#f8f8f2}.hljs-emphasis,.hljs-strong{color:#a8a8a2}.hljs-bullet,.hljs-link,.hljs-literal,.hljs-number,.hljs-quote,.hljs-regexp{color:#ae81ff}.hljs-code,.hljs-section,.hljs-selector-class,.hljs-title{color:#a6e22e}.hljs-strong{font-weight:700}.hljs-emphasis{font-style:italic}.hljs-attr,.hljs-keyword,.hljs-name,.hljs-selector-tag{color:#f92672}.hljs-attribute,.hljs-symbol{color:#66d9ef}.hljs-class .hljs-title,.hljs-params{color:#f8f8f2}.hljs-addition,.hljs-built_in,.hljs-builtin-name,.hljs-selector-attr,.hljs-selector-id,.hljs-selector-pseudo,.hljs-string,.hljs-template-variable,.hljs-type,.hljs-variable{color:#e6db74}.hljs-comment,.hljs-deletion,.hljs-meta{color:#75715e}";

  const coverImageSrc = !!post.coverImage?.url
    ? resizeImage(post.coverImage.url, {
        w: 1600,
        h: 840,
        c: "thumb",
      })
    : undefined;

  const tagsList = post.tags?.map((tag) => (
    <li key={tag.id}>
      <Link
        href={`/tag/${tag.slug}`}
        className="block rounded-full border px-2 py-1 font-medium hover:bg-slate-50 dark:border-neutral-800 dark:hover:bg-neutral-800 md:px-4"
      >
        #{tag.slug}
      </Link>
    </li>
  ));

  return (
    <AppProvider publication={publication} post={post}>
      <Layout>
        <Container className="mx-auto flex max-w-3xl flex-col items-stretch gap-10 px-5 py-10">
          <PersonalHeader />
          <article className="flex flex-col items-start gap-10 pb-10">
            <Head>
              <title>{post.seo?.title || post.title}</title>
              <style
                dangerouslySetInnerHTML={{ __html: highlightJsMonokaiTheme }}
              ></style>
            </Head>
            <h1 className="text-4xl leading-tight tracking-tight text-black dark:text-white">
              {post.title}
            </h1>
            {!!coverImageSrc && (
              <div className="w-full">
                <CoverImage
                  title={post.title}
                  priority={true}
                  src={coverImageSrc}
                />
              </div>
            )}
            <MarkdownToHtml contentMarkdown={post.content.markdown} />
            {(post.tags ?? []).length > 0 && (
              <div className="mx-auto w-full text-slate-600 dark:text-neutral-300 md:max-w-screen-md">
                <ul className="flex flex-row flex-wrap items-center gap-2">
                  {tagsList}
                </ul>
              </div>
            )}
          </article>
          <Footer />
        </Container>
      </Layout>
    </AppProvider>
  );
}

type Params = {
  params: {
    id: string;
  };
};

export async function getStaticProps({ params }: Params) {
  const [dataDraft, dataPublication] = await Promise.all([
    request<DraftByIdQuery, DraftByIdQueryVariables>(
      process.env.NEXT_PUBLIC_HASHNODE_GQL_ENDPOINT,
      DraftByIdDocument,
      {
        id: params.id,
      },
    ),
    request<PublicationByHostQuery, PublicationByHostQueryVariables>(
      process.env.NEXT_PUBLIC_HASHNODE_GQL_ENDPOINT,
      PublicationByHostDocument,
      {
        host: process.env.NEXT_PUBLIC_HASHNODE_PUBLICATION_HOST,
      },
    ),
  ]);

  const publication = dataPublication.publication;
  const post = dataDraft.draft;

  return {
    props: {
      post,
      publication,
    },
    revalidate: 1,
  };
}

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: "blocking",
  };
}
