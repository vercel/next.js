import CommentForm from "./form";
import CommentList from "./list";
import useComments from "../../hooks/useComment";

export default function Comment() {
  const { text, setText, comments, onSubmit, onDelete } = useComments();

  return (
    <div className="mt-20">
      <CommentForm onSubmit={onSubmit} text={text} setText={setText} />
      <CommentList comments={comments} onDelete={onDelete} />
    </div>
  );
}
