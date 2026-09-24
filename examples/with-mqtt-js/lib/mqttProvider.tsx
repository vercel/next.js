"use client";

import type { MqttClient } from "mqtt";
import MQTT from "mqtt";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface MqttContextValue {
  client: MqttClient | null;
  subscribeToTopic: (topic: string) => void;
  unsubscribeFromTopic: (topic: string) => void;
}

const MqttContext = createContext<MqttContextValue | null>(null);

export function MqttProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<MqttClient | null>(null);
  const topicSubscriptionsRef = useRef<Map<string, number>>(new Map());
  const [client, setClient] = useState<MqttClient | null>(null);

  useEffect(() => {
    if (clientRef.current) return;

    const topicSubscriptions = topicSubscriptionsRef.current;

    try {
      const mqttClient = MQTT.connect(process.env.NEXT_PUBLIC_MQTT_URI, {
        username: process.env.NEXT_PUBLIC_MQTT_USERNAME,
        password: process.env.NEXT_PUBLIC_MQTT_PASSWORD,
        clientId: process.env.NEXT_PUBLIC_MQTT_CLIENTID,
      });

      clientRef.current = mqttClient;
      setClient(mqttClient);
    } catch (error) {
      console.error("error", error);
    }

    return () => {
      clientRef.current?.end();
      clientRef.current = null;
      topicSubscriptions.clear();
    };
  }, []);

  const subscribeToTopic = useCallback((topic: string) => {
    const subscriptionCount = topicSubscriptionsRef.current.get(topic) ?? 0;

    if (subscriptionCount === 0) {
      clientRef.current?.subscribe(topic);
    }

    topicSubscriptionsRef.current.set(topic, subscriptionCount + 1);
  }, []);

  const unsubscribeFromTopic = useCallback((topic: string) => {
    const subscriptionCount = topicSubscriptionsRef.current.get(topic) ?? 0;

    if (subscriptionCount <= 1) {
      clientRef.current?.unsubscribe(topic);
      topicSubscriptionsRef.current.delete(topic);
      return;
    }

    topicSubscriptionsRef.current.set(topic, subscriptionCount - 1);
  }, []);

  const contextValue = useMemo(
    () => ({ client, subscribeToTopic, unsubscribeFromTopic }),
    [client, subscribeToTopic, unsubscribeFromTopic],
  );

  return (
    <MqttContext.Provider value={contextValue}>{children}</MqttContext.Provider>
  );
}

export function useMqttContext() {
  return useContext(MqttContext);
}
