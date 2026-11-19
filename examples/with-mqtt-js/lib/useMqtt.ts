import { useEffect } from "react";
import { useMqttContext } from "@/lib/mqttProvider";

interface useMqttProps {
  topicHandlers?: { topic: string; handler: (payload: any) => void }[];
}

function useMqtt({ topicHandlers = [] }: useMqttProps) {
  const mqttContext = useMqttContext();

  useEffect(() => {
    if (!topicHandlers || topicHandlers.length === 0) return () => {};
    if (!mqttContext?.client) return;

    const { client, subscribeToTopic, unsubscribeFromTopic } = mqttContext;

    topicHandlers.forEach((th) => {
      subscribeToTopic(th.topic);
    });

    const handleMessage = (topic: string, rawPayload: any, packet: any) => {
      const th = topicHandlers.find((t) => t.topic === topic);
      let payload;

      try {
        payload = JSON.parse(rawPayload);
      } catch {
        payload = rawPayload;
      }

      if (th) th.handler({ topic, payload, packet });
    };

    client.on("message", handleMessage);

    return () => {
      topicHandlers.forEach((th) => {
        unsubscribeFromTopic(th.topic);
      });
      client.removeListener("message", handleMessage);
    };
  }, [mqttContext, topicHandlers]);

  return mqttContext?.client ?? null;
}

export default useMqtt;
