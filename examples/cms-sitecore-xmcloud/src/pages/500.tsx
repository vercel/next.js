import Head from "next/head";
import {
  GraphQLErrorPagesService,
  SitecoreContext,
  ErrorPages,
} from "@sitecore-jss/sitecore-jss-nextjs";
import { SitecorePageProps } from "lib/page-props";
import Layout from "src/Layout";
import { componentFactory } from "temp/componentFactory";
import { GetStaticProps } from "next";
import config from "temp/config";
import { siteResolver } from "lib/site-resolver";

/**
 * Rendered in case if we have 500 error
 */
const ServerError = (): JSX.Element => (
  <>
    <Head>
      <title>500: Server Error</title>
    </Head>
    <div style={{ padding: 10 }}>
      <h1>500 Internal Server Error</h1>
      <p>
        There is a problem with the resource you are looking for, and it cannot
        be displayed.
      </p>
      <a href="/">Go to the Home page</a>
    </div>
  </>
);

const Custom500 = (props: SitecorePageProps): JSX.Element => {
  if (!(props && props.layoutData)) {
    return <ServerError />;
  }

  return (
    <SitecoreContext
      componentFactory={componentFactory}
      layoutData={props.layoutData}
    >
      <Layout layoutData={props.layoutData} />
    </SitecoreContext>
  );
};

export const getStaticProps: GetStaticProps = async (context) => {
  const site = siteResolver.getByName(config.jssAppName);
  const errorPagesService = new GraphQLErrorPagesService({
    endpoint: config.graphQLEndpoint,
    apiKey: config.sitecoreApiKey,
    siteName: site.name,
    language: context.locale || context.defaultLocale || config.defaultLanguage,
  });
  let resultErrorPages: ErrorPages | null = null;

  if (!process.env.DISABLE_SSG_FETCH) {
    try {
      resultErrorPages = await errorPagesService.fetchErrorPages();
    } catch (error) {
      console.log("Error occurred while fetching error pages");
      console.log(error);
    }
  }

  return {
    props: {
      layoutData: resultErrorPages?.serverErrorPage?.rendered || null,
    },
  };
};

export default Custom500;
