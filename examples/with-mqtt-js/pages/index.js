import { useState, useRef, useEffect } from 'react'
import useMqtt from '../lib/useMqtt'

export const getStaticProps = () =>{
  const rndId = 'code'
  return {props:{
    mqttUri: process.env.NEXT_PUBLIC_MQTT_URI,
    mqttOptions: {
      username: process.env.NEXT_PUBLIC_MQTT_USERNAME,
      password: process.env.NEXT_PUBLIC_MQTT_PASSWORD,
      clientId: process.env.NEXT_PUBLIC_MQTT_CLIENTID ?? `next_mqtt_${rndId}`,
    }
  }}
}

export default function Home({mqttUri, mqttOptions}) {
  const [incommingMessages, setIncommingMessages] = useState([])
  const addMessage = (message) => {
    console.log('currentMessages', incommingMessages)
    setIncommingMessages((incommingMessages) => [...incommingMessages, message])
  }
  const clearMessages = () => {
    setIncommingMessages(() => [])
  }

  const incommingMessageHandlers = useRef([
    {
      topic: 'topic1',
      handler: (msg) => {
        addMessage(msg)
      },
    }
  ])  
  
  const mqttClientRef = useRef(null)
  const setMqttClient = (client) => {mqttClientRef.current = client} 
  useMqtt({
    uri: mqttUri, 
    options: mqttOptions, 
    topicHandlers: incommingMessageHandlers.current, 
    onConnectedHandler: client => setMqttClient(client)}
  )

  const publishMessages = (client) => {
    if (!client) {
      console.log('(publishMessages) Cannot publish, mqttClient: ', client)
      return
    }

    client.publish('topic1', '1st message from component')
    client.publish('topic2', '2nd message from component')
  }

  return (
    <div>
      <h2>Subscribed Topics</h2>
      {incommingMessageHandlers.current.map((i) => (
        <p key={Math.random()}>{i.topic}</p>
      ))}
      <h2>Incomming Messages:</h2>
      {incommingMessages.map((m) => (
        <p key={Math.random()}>{m.payload.toString()}</p>
      ))}
      <button onClick={() => publishMessages(mqttClientRef.current)}>Publish Test Messages</button>
      <button onClick={() => clearMessages()}>Clear Test Messages</button>
    </div>
  )
}
