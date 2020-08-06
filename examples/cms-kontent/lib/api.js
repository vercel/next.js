import fs from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import { DeliveryClient } from "@kentico/kontent-delivery";

const postsDirectory = join(process.cwd(), '_posts')

const client = new DeliveryClient({
  projectId: process.env.KONTENT_PROJECT_ID
});

function parseAuthor(author) {
  return {
    name: author.name.value,
    picture: author.picture.value[0].url,
  }
}

function parsePost(post) {

  return {
    title: post.title.value,
    slug: post.slug.value,
    date: post.date.value.toISOString(),
    content: post.content.value,
    excerpt: post.excerpt.value,
    coverImage: post.cover_image.value[0].url,
    author: parseAuthor(post.author.value[0]),
  }
}

export async function getAllPostSlugs() {
  const postsResponse = await client.items()
    .type("post")
    .elementsParameter(["slug"])
    .toPromise();

  return postsResponse.items
    .map(post => post.slug.value);
}

export async function getPostBySlug(slug) {
  const post = await client.items()
    .type("post")
    .equalsFilter("elements.slug", slug)
    .toPromise()
    .then(result => result.getFirstItem())
    .then(post => parsePost(post))
  return post;
}

export async function getAllPosts() {
  const postsResponse = await client.items()
    .type("post")
    .orderByDescending("elements.date")
    .toPromise();

  return postsResponse.items
    .map(post => parsePost(post));
}
