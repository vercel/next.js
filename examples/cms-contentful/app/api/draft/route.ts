// Use Contentful's route handler for Live Preview and Draft Mode
export { enableDraftHandler as GET } from "@contentful/vercel-nextjs-toolkit/app-router";

// Use your own route handler for Draft Mode

// import { draftMode } from "next/headers";
// import { redirect } from "next/navigation";
// import { getPreviewPostBySlug } from "../../../lib/api";

// export async function GET(request: Request) {
//   const { searchParams } = new URL(request.url);
//   const secret = searchParams.get("secret");
//   const slug = searchParams.get("slug");

//   if (secret !== process.env.CONTENTFUL_PREVIEW_SECRET) {
//     return new Response("Invalid token", { status: 401 });
//   }

//   const post = await getPreviewPostBySlug(slug);

//   if (!post) {
//     return new Response("Invalid slug", { status: 401 });
//   }

//   draftMode().enable();
//   redirect(`/posts/${post.slug}`);
// }
