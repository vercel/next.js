import { useRouter } from 'next/router'
import { useEffectReducer } from 'use-effect-reducer'

import Comment from './comment'

function commentReducer(state, event, exec) {
  switch (event.type) {
    case 'FETCH_COMMENTS':
      exec({ type: 'fetchComments', slug: event.slug, page: event.page })
      return state

    case 'COMMENTS_FETCHED':
      return {
        ...event.data,
        docs: [...state.docs, ...event.data.docs],
      }

    default:
      return state
  }
}
const initialState = {
  docs: [],
  hasNextPage: false,
  hasPrevPage: false,
  nextPage: null,
  prevPage: null,
  page: 1,
  limit: 10,
  pagingCounter: 1,
  totalDocs: 0,
  totalPages: 1,
}
async function fetchComments(_, effect, dispatch) {
  const response = await fetch(
    `/api/article/${effect.slug}/comment?page=${effect.page}`
  )

  if (response.ok) {
    const data = await response.json()
    dispatch({ type: 'COMMENTS_FETCHED', data })
  }
}

const Comments = () => {
  const router = useRouter()
  const [state, dispatch] = useEffectReducer(
    commentReducer,
    (exec) => {
      exec({ type: 'fetchComments', slug: router.query.slug, page: 1 })

      return initialState
    },
    {
      fetchComments,
    }
  )

  return (
    <div className="row">
      <div className="col-12">
        <h3 className="lead font-weight-bold mb-4">
          Comments ({state.totalDocs})
        </h3>
        <hr />
        <ul className="list-unstyled">
          {state.docs.map((comment) => (
            <Comment key={comment._id} comment={comment} />
          ))}
        </ul>
        {state.hasNextPage && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              dispatch({
                type: 'FETCH_COMMENTS',
                slug: router.query.slug,
                page: state.nextPage,
              })
            }
          >
            Load {state.totalDocs - state.docs.length} comments more
          </button>
        )}
      </div>
    </div>
  )
}

export default Comments
