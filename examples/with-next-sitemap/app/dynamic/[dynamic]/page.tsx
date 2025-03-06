import { Metadata } from "next";

interface DynamicPageProps {
  params: { dynamic: string };
}

// Generate static params (equivalent to getStaticPaths)
export async function generateStaticParams() {
  return Array.from({ length: 10000 }, (_, index) => ({
    dynamic: `page-${index}`,
  }));
}

// Define metadata for SEO (optional)
export const metadata: Metadata = {
  title: "Dynamic Page",
};

export default function DynamicPage({ params }: DynamicPageProps) {
  return (
    <>
      <h1>Dynamic Page</h1>
      <h2>Query: {params.dynamic}</h2>
    </>
  );
}
