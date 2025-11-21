import { notFound } from "next/navigation";
import { getPayloadClient } from "../../../payload/payloadClient";
import Blocks from "../../../components/Blocks";
import { Hero } from "../../../components/Hero";
import { AdminBar } from "../../../components/AdminBar";
import { Metadata } from "next";

export async function generateMetadata({
  params: { slug },
}): Promise<Metadata> {
  return {
    title: slug,
  };
}

const Page = async ({ params: { slug } }) => {
  const payload = await getPayloadClient();

  const pages = await payload.find({
    collection: "pages",
    where: {
      slug: {
        equals: slug || "home",
      },
    },
  });

  const page = pages.docs[0];

  if (!page) return notFound();

  return (
    <>
      <AdminBar adminBarProps={{ collection: "pages", id: page.id }} />
      <Hero {...page.hero} />
      <Blocks blocks={page.layout} />
    </>
  );
};

export async function generateStaticParams() {
  const payload = await getPayloadClient();

  const pages = await payload.find({
    collection: "pages",
    limit: 0,
  });

  return pages.docs.map(({ slug }) => ({ slug }));
}

export default Page;
