import { SitecorePageProps } from "lib/page-props";
import { GetServerSidePropsContext, GetStaticPropsContext } from "next";
import { Plugin } from "..";
import { siteResolver } from "lib/site-resolver";
import config from "temp/config";

class SitePlugin implements Plugin {
  order = 0;

  async exec(
    props: SitecorePageProps,
    context: GetServerSidePropsContext | GetStaticPropsContext,
  ) {
    if (context.preview) return props;

    // Resolve site by name
    props.site = siteResolver.getByName(config.jssAppName);

    return props;
  }
}

export const sitePlugin = new SitePlugin();
