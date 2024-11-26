import Header from "../../../_components/header";

type Props = {
  params: Promise<{
    id: string;
    comment: string;
  }>;
};

export default async function CommentPage(props: Props) {
  const params = await props.params;
  return (
    <>
      <Header />
      <h1>Post: {params.id}</h1>
      <h1>Comment: {params.comment}</h1>
    </>
  );
}
