import React from "react";
import Link from "next/link";
import { AgilityImage } from "@agility/nextjs"

const PostsListing = ({ module, customData }) => {
  // get posts
  const { posts } = customData;


  // if there are no posts, display message on frontend
  if (posts.length <= 0) {
    return (
      <div className="mt-44 px-6 flex flex-col items-center justify-center">
        <h1 className="text-3xl text-center font-bold">No posts available.</h1>
        <div className="my-10">
          <Link href={"/"}>
            <a className="px-4 py-3 my-3 border border-transparent text-base leading-6 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-500 focus:outline-none focus:border-primary-700 focus:shadow-outline-primary transition duration-300">
              Return Home
            </a>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-8 mb-12">
      <div className="max-w-screen-xl mx-auto">
        <div className="sm:grid sm:gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => (
            <Link href={post.url} key={index}>
              <a>
                <div className="flex-col group mb-8 md:mb-0">
                  <div className="relative h-64">
                    <AgilityImage
                      src={post.imageSrc}
                      alt={post.imageAlt}
                      className="object-cover object-center rounded-t-lg"
                      layout="fill"
                    />
                  </div>
                  <div className="bg-gray-100 p-8 border-2 border-t-0 rounded-b-lg">
                    <div className="uppercase text-primary-500 text-xs font-bold tracking-widest leading-loose">
                      {post.category}
                    </div>
                    <div className="border-b-2 border-primary-500 w-8"></div>
                    <div className="mt-4 uppercase text-gray-600 italic font-semibold text-xs">
                      {post.date}
                    </div>
                    <h2 className="text-secondary-500 mt-1 font-black text-2xl group-hover:text-primary-500 transition duration-300">
                      {post.title}
                    </h2>
                  </div>
                </div>
              </a>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

// function to resole post urls
const resolvePostUrls = function (sitemap, posts) {
  let dynamicUrls = {};
  posts.forEach((post) => {
    Object.keys(sitemap).forEach((path) => {
      if (sitemap[path].contentID === post.contentID) {
        dynamicUrls[post.contentID] = path;
      }
    });
  });
  return dynamicUrls;
};

PostsListing.getCustomInitialProps = async ({
  agility,
  channelName,
  languageCode,
}) => {
  // set up api
  const api = agility;

  try {
    // get sitemap...
    let sitemap = await api.getSitemapFlat({
      channelName: channelName,
      languageCode,
    });

    // get posts...
    let rawPosts = await api.getContentList({
      referenceName: "posts",
      languageCode,
	  contentLinkDepth: 2,
	  depth: 2,
	  take: 50
    });

    // resolve dynamic urls
    const dynamicUrls = resolvePostUrls(sitemap, rawPosts.items);

    const posts = rawPosts.items.map((post) => {
      //category
      const category = post.fields.category?.fields.title || "Uncategorized"

      // date
      const date = new Date(post.fields.date).toLocaleDateString();

      // url
      const url = dynamicUrls[post.contentID] || "#";

      // post image src
      let imageSrc = post.fields.image.url;

      // post image alt
      let imageAlt = post.fields.image?.label || null;

      return {
        contentID: post.contentID,
        title: post.fields.title,
        date,
        url,
        category,
        imageSrc,
        imageAlt,
      };
    });

    return {
      posts,
    };
  } catch (error) {
    if (console) console.error(error);
  }
};

export default PostsListing;
