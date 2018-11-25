export default ({id, votes, onClickHandler, className}) => (
  <button className={className} onClick={() => onClickHandler()}>
    <style jsx>{`
      button {
        background-color: transparent;
        border: 1px solid #e4e4e4;
        color: #000;
      }
      button:active {
        background-color: transparent;
      }
      button:before {
        align-self: center;
        border-color: transparent transparent #000000 transparent;
        border-style: solid;
        border-width: 0 4px 6px 4px;
        content: '';
        height: 0;
        margin-right: 0px;
        width: 0;
      }
      .downvote {
        transform: rotate(180deg);
      }
      .upvote {
        transform: rotate(0deg);
      }
    `}</style>
  </button>
)
