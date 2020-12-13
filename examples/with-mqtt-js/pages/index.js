import { useState } from 'react'
import useMqtt from '../lib/useMqtt'


export const getServerSideProps = async () =>{
  return {
    props: {
      mqttUri: process.env.NEXT_PUBLIC_MQTT_URI
    }
  }
}

export default function Home({mqttUri}) {
  console.log('mqttUri', mqttUri)
  // const mqttUri = process.env.NEXT_PUBLIC_MQTT_URI
  const clientId = process.env.NEXT_PUBLIC_MQTT_CLIENTID || `next_mqtt_${Math.random().toString(16).substr(2, 8)}`
  const mqttOptions = {
    username: process.env.NEXT_PUBLIC_MQTT_USERNAME,
    password: process.env.NEXT_PUBLIC_MQTT_PASSWORD,
    clientId: clientId,
  }


  const [incommingMessages, setIncommingMessages] = useState([])

  const addMessage = (message) => {
    setIncommingMessages((currentMessages) => [...currentMessages, message])
  }

  
  const clearMessages = () => {
    setIncommingMessages(() => [])
  }

  const incommingMessageHandlers = [
    {
      topic: 'topic1',
      handler: (msg) => {
        addMessage(msg)
      },
    },
    {
      topic: 'topic2',
      handler: (msg) => {
        addMessage(msg)
      },
    },
  ]
  
  const [mqttClient, setMqttClient] = useState(null) 
  useMqtt(
    mqttUri, 
    mqttOptions, 
    incommingMessageHandlers, 
    client => setMqttClient(client)
  )

  const publishMessages = () => {
    if (!mqttClient) {
      console.log('Cannot publish, mqttClient: ', mqttClient)
      return
    }

    mqttClient.publish('topic1', '1st message from component')
    mqttClient.publish('topic2', '2nd message from component')
  }

  return (
    <div>
      <h2>Subscribed Topics</h2>
      {incommingMessageHandlers.map((i) => (
        <p key={Math.random()}>{i.topic}</p>
      ))}
      <h2>Incomming Messages:</h2>
      {incommingMessages.map((m) => (
        <p key={Math.random()}>{m.payload.toString()}</p>
      ))}
      <button onClick={() => publishMessages()}>Publish Test Messages</button>
      <button onClick={() => clearMessages()}>Clear Test Messages</button>
    </div>
  )
}
