import { Builder, builder } from "@builder.io/react";
import { BUILDER_CONFIG } from "./constants";

builder.init(BUILDER_CONFIG.apiKey);
Builder.isStatic = true;

export function getAllPostsWithSlug() {
  return builder.getAll(BUILDER_CONFIG.postsModel, {
    options: { noTargeting: true },
    apiKey: BUILDER_CONFIG.apiKey,
  });
}

export function getDraftPost(id) {
  return fetch(
    `https://builder.io/api/v2/content/${BUILDER_CONFIG.postsModel}/${id}?apiKey=${BUILDER_CONFIG.apiKey}&preview=true&noCache=true&cachebust=tru&includeRefs=true`,
  )
    .then((res) => res.json())
    .then((res) => res || null);
}

export async function searchPosts(query, preview, limit = 20, offset = 0) {
  let posts = await builder.getAll(BUILDER_CONFIG.postsModel, {
    limit,
    offset,
    includeRefs: true,
    preview: BUILDER_CONFIG.postsModel,
    staleCacheSeconds: preview ? 1 : 200,
    apiKey: BUILDER_CONFIG.apiKey,
    ...(preview && { includeUnpublished: true }),
    options: {
      noTargeting: true,
    },
    query,
  });

  if (preview) {
    posts = await Promise.all(posts.map((post) => getDraftPost(post.id)));
  }

  return posts;
}

export function getAllPostsForHome(preview) {
  return searchPosts(
    { "data.slug": { $exists: true }, "data.author": { $exists: true } },
    preview,
  );
}

export async function getPost(mongoQuery, preview) {
  let post = preview
    ? (await searchPosts(mongoQuery, true))?.[0]
    : await builder
        .get(BUILDER_CONFIG.postsModel, {
          includeRefs: true,
          staleCacheSeconds: 20,
          apiKey: BUILDER_CONFIG.apiKey,
          preview: BUILDER_CONFIG.postsModel,
          options: {
            noTargeting: true,
          },
          query: mongoQuery,
        })
        .toPromise();

  return post || null;
}

export async function getPostAndMorePosts(slug, preview, previewData) {
  const post =
    preview && previewData
      ? await getDraftPost(previewData.postDraftId)
      : await getPost(
          {
            "data.slug": { $eq: slug },
          },
          preview,
        );

  const morePosts = await searchPosts(
    {
      "data.slug": { $ne: slug, $exists: true },
      "data.author": { $exists: true },
    },
    preview,
    2,
  );

  return {
    post,
    morePosts,
  };
}
