import { useState } from 'react';
import useMqtt from '../lib/useMqtt';

const mqttUri = 'wss://test.mosquitto.org:8081';
const mqttOptions = {
  username: '',
  password: '',
  clientId: `next_mqtt_${Math.random().toString(16).substr(2, 8)}`,
};

export default function Home() {
  const [incommingMessages, setIncommingMessages] = useState([]);

  const addMessage = (message) => {
    setIncommingMessages((currentMessages) => [...currentMessages, message]);
  };

  const incommingMessageHandlers = [
    {
      topic: 'topic1',
      handler: (msg) => {
        addMessage(msg);
      },
    },
    {
      topic: 'topic2',
      handler: (msg) => {
        addMessage(msg);
      },
    },
  ];
  const mqttClient = useMqtt(mqttUri, mqttOptions, incommingMessageHandlers);

  const publishMessages = () => {
    if(!mqttClient.publish){
      return;
    }

    mqttClient.publish('topic1', '1st message from component');
    mqttClient.publish('topic2', '2nd message from component');
  };

  const clearMessages = () => {
    setIncommingMessages([]);
  };

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
  );
}
