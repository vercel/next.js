import { Page } from "@/gql/graphql";

export const setSeoData = ({ seo }: { seo: Page["seo"] }) => {
  if (!seo) return {};

  return {
    metadataBase: new URL(`${process.env.NEXT_PUBLIC_BASE_URL}`),
    title: seo.title || "",
    description: seo.metaDesc || "",
    robots: {
      index: seo.metaRobotsNoindex === "index" ? true : false,
      follow: seo.metaRobotsNofollow === "follow" ? true : false,
    },
    openGraph: {
      title: seo.opengraphTitle || "",
      description: seo.opengraphDescription || "",
      url: seo.opengraphUrl || "",
      siteName: seo.opengraphSiteName || "",
      images: [
        {
          url: seo.opengraphImage?.sourceUrl || "",
          width: seo.opengraphImage?.mediaDetails?.width || 1200,
          height: seo.opengraphImage?.mediaDetails?.height || 630,
          alt: seo.opengraphImage?.altText || "",
        },
      ],
      locale: "da_DK",
      type: seo.opengraphType || "website",
    },
    twitter: {
      card: "summary_large_image",
      title: seo.twitterTitle || "",
      description: seo.twitterDescription || "",
      images: [seo.twitterImage?.sourceUrl || ""],
    },
  };
};
