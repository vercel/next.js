import Head from "next/head";
import ErrorPage from "next/error";
import { useRouter } from "next/router";
import Layout from "../components/layout";
import Container from "../components/container";
import { CMS_NAME } from "../lib/constants";
import { getAgilityPaths, getAgilityPageProps } from "../lib/api";
import usePreviewRedirect from "../lib/use-preview-redirect";
import CMSPageTemplate from "../lib/components/page-template";

export default function Slug({
  sitemapNode,
  page,
  pageTemplateName,
  languageCode,
  channelName,
  preview,
}) {
  usePreviewRedirect();

  const router = useRouter();
  if (!router.isFallback && !page) {
    return <ErrorPage statusCode={404} />;
  }

  return (
    <>
      <Layout preview={preview}>
        <Head>
          <title>{`Next.js Blog Example with ${CMS_NAME}`}</title>
        </Head>
        <Container>
          {router.isFallback ? (
            <h1>Loading...</h1>
          ) : (
            <CMSPageTemplate
              sitemapNode={sitemapNode}
              page={page}
              pageTemplateName={pageTemplateName}
              languageCode={languageCode}
              channelName={channelName}
              preview={preview}
            />
          )}
        </Container>
      </Layout>
    </>
  );
}

export async function getStaticProps({ params, preview = false }) {
  const props = await getAgilityPageProps({ params, preview });

  if (!props) {
    return { props: {} };
  }

  return {
    props: {
      sitemapNode: props.sitemapNode,
      page: props.page,
      pageTemplateName: props.pageTemplateName,
      languageCode: props.languageCode,
      channelName: props.channelName,
      preview,
    },
  };
}

export async function getStaticPaths() {
  const paths = await getAgilityPaths();
  return {
    paths: paths,
    fallback: true,
  };
}
