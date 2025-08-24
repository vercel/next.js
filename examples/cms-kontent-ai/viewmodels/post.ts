import { Author } from "./author";

export type Post = {
  title: string;
  slug: string;
  date: string | null;
  content: string;
  excerpt: string;
  coverImage: string;
  author: Author;
};
