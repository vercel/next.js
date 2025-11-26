import AuthorType from "./authorType";

type PostType = {
  url: string;
  title: string;
  featuredImage: string;
  date: string;
  author: AuthorType;
  excerpt: string;
  categories: string[];
  content: string;
  tags: string[];
};

export default PostType;
