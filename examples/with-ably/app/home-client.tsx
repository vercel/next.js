"use client";

import { useState } from "react";
import Image from "next/image";
import * as Ably from "ably";
import { useChannel, usePresence, usePresenceListener } from "ably/react";
import type { ProxyMessage, TextMessage } from "../types";
import AblyClientProvider from "./ably-client-provider";

function ChatArea() {
  const [messages, setMessages] = useState<TextMessage[]>([]);

  const { channel, ably } = useChannel(
    "some-channel-name",
    (message: Ably.Message) => {
      console.log("Received Ably message", message);
      setMessages((prev) => [...prev, message.data as TextMessage]);
    },
  );

  const { updateStatus } = usePresence("some-channel-name");
  const { presenceData } = usePresenceListener("some-channel-name");

  const messageList = messages.map((message, index) => (
    <li key={index}>{message.text}</li>
  ));

  const presentClients = presenceData.map((msg, index) => (
    <li key={index}>
      {msg.clientId}: {String(msg.data ?? "")}
    </li>
  ));

  return (
    <main className="main">
      <h2>Present Clients</h2>
      <button onClick={() => updateStatus("hello")}>
        Update status to hello
      </button>
      <ul>{presentClients}</ul>

      <h2>Ably Message Data</h2>
      <button
        onClick={() => {
          const message: TextMessage = {
            text: `${ably.auth.clientId} sent a message`,
          };
          channel.publish("test-message", message);
        }}
      >
        Send A Message
      </button>
      <button
        onClick={() => {
          const proxyMessage: ProxyMessage = {
            sender: `${ably.auth.clientId}`,
          };

          fetch("/api/send-message", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(proxyMessage),
          });
        }}
      >
        Send A Message From the Server
      </button>
      <ul>{messageList}</ul>
    </main>
  );
}

export default function HomeClient() {
  return (
    <div className="container">
      <h1>Realtime messaging with Next.js and Ably</h1>
      <p>
        Use the buttons below to send and receive messages or to update your
        status.
      </p>
      <AblyClientProvider>
        <ChatArea />
      </AblyClientProvider>
      <footer className="footer">
        Powered by
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image src="/vercel.svg" alt="Vercel Logo" width={100} height={32} />
        </a>
        and
        <a href="https://ably.com/">
          <Image
            src="/ably.svg"
            alt="Ably Realtime"
            width={204}
            height={64}
            className="logo"
          />
        </a>
      </footer>
    </div>
  );
}
