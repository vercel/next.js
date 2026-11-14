"use client";

import { sendXEvent } from "@/_components/XPixel";

export function EventButton() {
  return (
    <button
      onClick={() =>
        sendXEvent(process.env.NEXT_PUBLIC_X_PURCHASE_EVENT_ID as string, {
          value: 10,
          currency: "USD",
        })
      }
    >
      Buy $10
    </button>
  );
}
