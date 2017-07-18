import {Component} from 'react'

class ChatPannel extends Component {
  render () {
    return (
      <div className='pannel'>
        <p> Name - {this.props.details.userName}</p>
        <style jsx>{`
          .pannel {
            align-items: flex-end;
            padding: 2vh;
            margin-top: auto;
            margin-left: 2vw;
            margin-right: 2vw;
            height: 40vh;
            background-color: rgb(237, 239, 244);
            width: 20vw;
            border: '1px solid rgba(29, 49, 91, .3);
          }
        `}</style>
      </div>
    )
  }
}

export default ChatPannel
