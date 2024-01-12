import { config, list } from "@keystone-next/keystone/schema";
import { text } from "@keystone-next/fields";

const Post = list({
  fields: {
    title: text({ isRequired: true }),
    slug: text(),
    content: text(),
  },
});

export default config({
  db: { provider: "sqlite", url: "file:./app.db" },
  experimental: {
    generateNextGraphqlAPI: true,
    generateNodeAPI: true,
  },
  lists: { Post },
});
