import { GetStaticProps } from "next";
import Link from "next/link";
import Layout from "../../components/Layout";
import { QueryClient } from "react-query";
import { dehydrate } from "react-query/hydration";
import { api, usePosts } from "../../hooks/usePosts";
import { TPost } from "../../types";
import { useRouterReady } from "../../hooks/common";

const Posts = () => {
  const { isRouterReady, router } = useRouterReady();

  const { isLoading, isError, data } = usePosts<TPost[]>(
    ["posts", 'limit=3'],
    '/posts?_limit=3',
    isRouterReady,
  );

  if (isLoading) {
    return 'Loading...';
  }

  if(isError) {
    return 'Something happened';
  }

  return (
    <>
      <h2>Post List</h2>
      {data && (
        <ul>
          {data.map((post) => {
            return (
              <li key={post.id}>
                <h3>
                  <Link href={`/posts/${post.id}`}>
                    <a>{post.title}</a>
                  </Link>
                </h3>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};

export default Posts;

// This function gets called at build time on server-side.
// It won't be called on client-side, so you can even do
// direct database queries.
export const getStaticProps: GetStaticProps = async () => {

  // Prefetching post on server side. Post will be available to useQuery hook on client side without any refetch
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery(["posts", 'limit=3'], async () => {
    return await api<TPost[]>('/posts?_limit=3');
  });

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
  };

};
