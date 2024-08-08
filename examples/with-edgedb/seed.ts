import { client, e } from "./client";

const posts = [
  {
    title: "Join the EdgeDB Discord",
    content: "Just follow [this link](https://edgedb.com/p/discord).",
    published: true,
    authorName: "Bobby",
  },
  {
    title: "Follow EdgeDB on Twitter",
    content: "We're [@edgedatabase](https://www.twitter.com/edgedatabase).",
    published: true,
    authorName: "Sally",
  },
  {
    title: "Star EdgeDB on GitHub",
    content:
      "The repo is at [github.com/edgedb/edgedb](https://www.github.com/edgedb/edgedb).",
    published: true,
    authorName: "Polly",
  },
  {
    title: "Try the EdgeDB query builder for TypeScript",
    content:
      "The docs are [here](https://www.edgedb.com/docs/clients/01_js/index).",
    published: false,
    authorName: "Polly",
  },
];

async function main() {
  console.log(`Start seeding...`);

  for (const post of posts) {
    const newPost = await e
      .insert(e.Post, {
        ...post,
        published: post.published ? e.std.datetime_current() : null,
      })
      .run(client);

    console.log(`Created Post ${newPost.id}`);
  }
  console.log(`Seeding complete!`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
