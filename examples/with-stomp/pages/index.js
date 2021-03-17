import useStomp from '../useStomp'

/**
 * In this example you can easily connect to an Stomp Websocket server, and subscribe to a topic by a custom Hook.
 */
const Index = () => {
  // get message
  const message = useStomp('/any/topic')

  // Check inside The message
  console.log('##### new message : ', message)

  return (
    <div>
      <h3>New Message:</h3>
      <p>{message.text}</p>
    </div>
  )
}

export default Index
