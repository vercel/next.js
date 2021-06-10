const dev = process.env.NODE_ENV !== 'production';

export const server = dev ? 'http://localhost:3000' : 'https://your_deployment.server.com';

export async function getAllPostsForHome(previewData) {
  const response = await fetch(`${server}/api/posts`);
  const data = await response.json();
  return data.posts;
}

export async function getAllPostsWithSlug() {
  const response = await fetch(`${server}/api/posts?slug=true`,);
  const data = await response.json();
  return data.posts;
}

export async function getPostAndMorePosts(slug, previewData) {
  const response = await fetch(`${server}/api/posts?slug=true`,);
  const data = await response.json();
  const postIndex = data.posts.findIndex(post => post.slug === slug);
  const post = data.posts[postIndex];
  const morePosts = [...data.posts.slice(0, postIndex), ...data.posts.slice(postIndex + 1)];
  return { post, morePosts };
}