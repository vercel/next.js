"use client";

import { useState, useRef } from "react";
import type { MqttClient } from "mqtt";
import useMqtt from "@/lib/useMqtt";

export default function Home() {
  const [incommingMessages, setIncommingMessages] = useState<any[]>([]);
  const addMessage = (message: any) => {
    setIncommingMessages((incommingMessages) => [
      ...incommingMessages,
      message,
    ]);
  };
  const clearMessages = () => {
    setIncommingMessages(() => []);
  };

  const incommingMessageHandlers = useRef([
    {
      topic: "topic1",
      handler: (msg: string) => {
        addMessage(msg);
      },
    },
  ]);

  const mqttClientRef = useRef<MqttClient | null>(null);
  const setMqttClient = (client: MqttClient) => {
    mqttClientRef.current = client;
  };
  useMqtt({
    uri: process.env.NEXT_PUBLIC_MQTT_URI,
    options: {
      username: process.env.NEXT_PUBLIC_MQTT_USERNAME,
      password: process.env.NEXT_PUBLIC_MQTT_PASSWORD,
      clientId: process.env.NEXT_PUBLIC_MQTT_CLIENTID,
    },
    topicHandlers: incommingMessageHandlers.current,
    onConnectedHandler: (client) => setMqttClient(client),
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
      {incommingMessageHandlers.current.map((i) => (
        <p key={Math.random()}>{i.topic}</p>
      ))}
      <h2>Incomming Messages:</h2>
      {incommingMessages.map((m) => (
        <p key={Math.random()}>{m.payload.toString()}</p>
      ))}
      <button onClick={() => publishMessages(mqttClientRef.current)}>
        Publish Test Messages
      </button>
      <button onClick={() => clearMessages()}>Clear Test Messages</button>
    </div>
  );
}
