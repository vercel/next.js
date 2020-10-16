import MQTT from 'mqtt';
import { useEffect, useRef } from 'react';

function useMqtt(
  uri,
  options = {},
  topicHandlers = [{ topic: '', handler: () => {} }],
) {
  const clientRef = useRef({});

  useEffect(() => {
    try {
      clientRef.current = options
        ? MQTT.connect(uri, options)
        : MQTT.connect(uri);
    } catch (error) {
      console.error('error', error);
    }
    const client = clientRef.current;
    topicHandlers.forEach((th) => {
      client.subscribe(th.topic);
    });
    client.on('message', (topic, rawPayload, packet) => {
      const th = topicHandlers.find((t) => t.topic === topic);
      let payload;
      try{
        payload = JSON.parse(rawPayload);
      }
      catch {
        payload = rawPayload;
      }
      th?.handler({ topic, payload, packet });
    });

    return () => {
      if (client) {
        topicHandlers.forEach((th) => {
          client.unsubscribe(th.topic);
        });
        client.end();
      }
    };
  }, []);

  return clientRef.current;
}

export default useMqtt;
