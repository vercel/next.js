import { GetStaticProps, GetStaticPaths } from "next";
import { QueryClient } from "react-query";
import { api, usePost } from "../../hooks/usePosts";
import { dehydrate } from "react-query/hydration";
import { TPost } from "../../types";

const Post = () => {
  const { isLoading, isError, data } = usePost();
  
  if (isLoading) {
    return 'Loading...';
  }

  if(isError) {
    return 'Something happened';
  }

  return (
    <>  
    {
      data && (
        <>  
          <h1>{data.title}</h1>
          <p>{data.body}</p>
        </>
    ) }
    </>
  );
};

export default Post;

export const getStaticPaths: GetStaticPaths = async () => {

  // We'll pre-render only these paths at build time.
  const paths = [`/posts/1`, `/posts/2`, `/posts/3`]

  // { fallback: false } means other routes should 404.
  return { paths, fallback: false }
}

// This function gets called at build time on server-side.
// It won't be called on client-side, so you can even do
// direct database queries.
export const getStaticProps: GetStaticProps = async ({ params }) => {
  const id = params?.id;

  // Prefetching post on server side. Post will be available to useQuery hook on client side without any refetch
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery(['posts', id], async () => {
    return await api<TPost>(`/posts/${id}`);
  });

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
  };
};
