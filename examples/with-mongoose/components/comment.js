import PropTypes from 'prop-types'

const Comment = ({ comment }) => (
  <li className="media">
    <svg
      className="bd-placeholder-img mr-3"
      width="64"
      height="64"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
      role="img"
      aria-label="Placeholder: 64x64"
    >
      <title>Placeholder</title>
      <rect width="100%" height="100%" fill="#868e96"></rect>
      <text x="50%" y="50%" fill="#dee2e6" dy=".3em">
        64x64
      </text>
    </svg>
    <div className="media-body">
      <h5 className="mt-0">{comment.nickname}</h5>
      <p>
        {comment.body.split('\n').map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </p>
    </div>
  </li>
)

export const commentShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  nickname: PropTypes.string.isRequired,
  body: PropTypes.string.isRequired,
})

Comment.propTypes = {
  comment: commentShape,
}

export default Comment
