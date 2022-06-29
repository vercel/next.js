export type Imgix = {
  url: string;
  imgix_url: string;
}

export type Author = {
  title: string;
  metadata: {
    picture: Imgix;
  }
}

export type Post = {
  title: string;
  slug: string;
  content: string;
  created_at: string;
  metadata: {
    cover_image: Imgix;
    author: Author;
    excerpt: string;
    content: string;
  }
};