// components/CreateOrderButton.jsx
"use client";

export default function CreateOrderButton() {
  const handleClick = async () => {
    const newOrder = { itemId: "B102", quantity: 2 };
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { Authorization: "session-id-or-jwt" },
      body: JSON.stringify(newOrder),
    });
    const data = await response.json();
    alert(data.result);
  };

  return <button onClick={handleClick}>Create order</button>;
}
