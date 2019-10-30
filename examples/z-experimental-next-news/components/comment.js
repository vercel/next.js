import timeAgo from '../lib/time-ago'
import React from 'react'

export default class Comment extends React.Component {
  constructor (props) {
    super(props)
    this.state = {}
    this.toggle = this.toggle.bind(this)
  }

  render () {
    const { user, text, date, comments } = this.props
    return (
      <div className='comment'>
        <div className='meta'>
          {user} {timeAgo(new Date(date))} ago{' '}
          <span onClick={this.toggle} className='toggle'>
            {this.state.toggled
              ? `[+${(this.props.commentsCount || 0) + 1}]`
              : '[-]'}
          </span>
        </div>

        {this.state.toggled
          ? null
          : [
            <div
              key='text'
              className='text'
              dangerouslySetInnerHTML={{ __html: text }}
            />,
            <div key='children' className='children'>
              {comments.map(comment => (
                <Comment key={comment.id} {...comment} />
              ))}
            </div>
          ]}

        <style jsx>{`
          .comment {
            padding-top: 15px;
          }

          .children {
            padding-left: 20px;
          }

          .meta {
            font-size: 12px;
            margin-bottom: 5px;
          }

          .toggle {
            cursor: pointer;
          }

          .text {
            color: #000;
            font-size: 13px;
            line-height: 18px;
          }

          /* hn styles */

          .text :global(p) {
            margin-top: 10px;
          }

          .text :global(pre) {
            margin-bottom: 10px;
          }

          .text :global(a) {
            color: #000;
          }
        `}</style>
      </div>
    )
  }

  toggle () {
    this.setState({ toggled: !this.state.toggled })
  }
}
