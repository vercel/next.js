const Comment = ({ params }: { params: { slug: string[] } }) => {
  const slug = params?.slug;

  return (
    <>
      <h1>Slug: {slug.join("/")}</h1>
    </>
  );
};

export default Comment;
