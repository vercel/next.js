import Header from "../../../_components/header";

type Props = {
  params: {
    id: string;
    comment: string;
  };
};

export default function CommentPage({ params }: Props) {
  return (
    <>
      <Header />
      <h1>Post: {params.id}</h1>
      <h1>Comment: {params.comment}</h1>
    </>
  );
}
