import CommentForm from './form'
import CommentList from './list'
import useComments from '../../hooks/useComment'

function Comment() {
  const [text, textSet, comments, onSubmit, onDelete] = useComments()

  return (
    <div className="mt-20">
      <CommentForm onSubmit={onSubmit} text={text} textSet={textSet} />
      <CommentList comments={comments} onDelete={onDelete} />
    </div>
  )
}

export default Comment
