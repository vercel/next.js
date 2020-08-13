const Message = ({ message }) => (
  <>
    <div className="py-1">
      <p className="text-blue-700 font-bold">{message.author.username}</p>
      <p className="text-white">{message.message}</p>
    </div>
  </>
)

export default Message
