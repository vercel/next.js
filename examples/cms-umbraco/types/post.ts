import Author from "./author";
import Picture from "./picture";

type Post = {
  id: string;
  slug: string;
  title: string;
  coverImage: Picture;
  date: string;
  author: Author;
  excerpt: string;
  content: string;
  tags: string[];
};

export default Post;
