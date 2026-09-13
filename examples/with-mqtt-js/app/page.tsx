"use client";

import { useState, useRef } from "react";
import useMqtt from "@/lib/useMqtt";

export default function Home() {
  const [incomingMessages, setIncomingMessages] = useState<any[]>([]);
  const addMessage = (message: any) => {
    setIncomingMessages((incomingMessages) => [...incomingMessages, message]);
  };
  const clearMessages = () => {
    setIncomingMessages(() => []);
  };

  const incomingMessageHandlers = useRef([
    {
      topic: "topic1",
      handler: (msg: string) => {
        addMessage(msg);
      },
    },
  ]);

  const mqttClient = useMqtt({
    topicHandlers: incomingMessageHandlers.current,
  });

  const publishMessages = (client: any) => {
    if (!client) {
      console.log("(publishMessages) Cannot publish, mqttClient: ", client);
      return;
    }

    client.publish("topic1", "1st message from component");
  };

  return (
    <div>
      <h2>Subscribed Topics</h2>
      {incomingMessageHandlers.current.map((i) => (
        <p key={Math.random()}>{i.topic}</p>
      ))}
      <h2>Incoming Messages:</h2>
      {incomingMessages.map((m) => (
        <p key={Math.random()}>{m.payload.toString()}</p>
      ))}
      <button onClick={() => publishMessages(mqttClient)}>
        Publish Test Messages
      </button>
      <button onClick={() => clearMessages()}>Clear Test Messages</button>
    </div>
  );
}
