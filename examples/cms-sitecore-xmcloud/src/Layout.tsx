/**
 * This Layout is needed for Starter Kit.
 */
import React from "react";
import Head from "next/head";
import {
  Placeholder,
  getPublicUrl,
  LayoutServiceData,
  Field,
} from "@sitecore-jss/sitecore-jss-nextjs";
import Scripts from "src/Scripts";

// Prefix public assets with a public URL to enable compatibility with Sitecore Experience Editor.
// If you're not supporting the Experience Editor, you can remove this.
const publicUrl = getPublicUrl();

interface LayoutProps {
  layoutData: LayoutServiceData;
}

interface RouteFields {
  [key: string]: unknown;
  Title?: Field;
}

const Layout = ({ layoutData }: LayoutProps): JSX.Element => {
  const { route } = layoutData.sitecore;
  const fields = route?.fields as RouteFields;
  const isPageEditing = layoutData.sitecore.context.pageEditing;
  const mainClassPageEditing = isPageEditing ? "editing-mode" : "prod-mode";

  return (
    <>
      <Scripts />
      <Head>
        <title>{fields?.Title?.value?.toString() || "Page"}</title>
        <link rel="icon" href={`${publicUrl}/favicon.ico`} />
      </Head>

      {/* root placeholder for the app, which we add components to using route data */}
      <div className={mainClassPageEditing}>
        <header>
          <div id="header">
            {route && <Placeholder name="headless-header" rendering={route} />}
          </div>
        </header>
        <main>
          <div id="content">
            {route && <Placeholder name="headless-main" rendering={route} />}
          </div>
        </main>
        <footer>
          <div id="footer">
            {route && <Placeholder name="headless-footer" rendering={route} />}
          </div>
        </footer>
      </div>
    </>
  );
};

export default Layout;
