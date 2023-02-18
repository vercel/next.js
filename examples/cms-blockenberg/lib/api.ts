import { lookup } from "./webnative";
import Post from "../interfaces/post";
import { formatISO } from "date-fns";
import PostType from "../interfaces/post";

const token = process.env.BLOCKEN_TOKEN;

export async function getPostBySlug(slug: string) {
  const posts = await getAllPosts();

  const post = posts.find((p) => p.slug === slug);

  return post;
}

const anon = {
  name: "Anon",
  picture: "https://source.unsplash.com/random/100x100/?person",
};

export async function getAllPosts() {
  const documents = await lookup(token);
  const wnposts = documents.sort((a, b) => b.updated - a.updated);

  const posts: Post[] = wnposts.map((apiObject) => ({
    slug: apiObject.cid,
    title: apiObject.post.header,
    date: formatISO(new Date(apiObject.updated)),
    coverImage: apiObject.image,
    author: anon,
    excerpt: String(apiObject.post.content).slice(0, 200) + "...",
    ogImage: { url: apiObject.image },
    content: apiObject.post.content,
  }));

  return posts;
}

export async function getPostByCID(cid: string) {
  const result = await fetch(
    `https://ipfs.runfission.com/ipfs/${cid}/userland`,
  );
  const resultjson = await result.json();
  //console.log(resultjson);
  const imagejson = JSON.parse(resultjson.image);
  const image = `https://ipfs.runfission.com/ipfs/${
    String(imagejson.cid).replace(/[CID\(\)]/g, "")
  }/userland`;
  const post: PostType = {
    slug: cid,
    title: resultjson.header,
    date: resultjson.ctime || null,
    coverImage: image,
    author: anon,
    excerpt: "",
    ogImage: {
      url: image,
    },
    content: resultjson.content,
  };
  return post;
}
