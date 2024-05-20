import React, { useState, useEffect } from 'react';

const LiveChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    // This is where we would connect to the live chat service
    // For demonstration purposes, we'll simulate receiving a new message after 5 seconds
    const timeoutId = setTimeout(() => {
      setMessages((prevMessages) => [...prevMessages, { id: Date.now(), text: 'Hello from the other side!' }]);
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, []);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleSendMessage = () => {
    if (inputValue.trim()) {
      // This is where we would send the message to the live chat service
      // For demonstration purposes, we'll just add it to the local state
      setMessages((prevMessages) => [...prevMessages, { id: Date.now(), text: inputValue }]);
      setInputValue('');
    }
  };

  return (
    <div>
      <h2>Live Chat</h2>
      <div>
        {messages.map((message) => (
          <div key={message.id}>{message.text}</div>
        ))}
      </div>
      <input type="text" value={inputValue} onChange={handleInputChange} />
      <button onClick={handleSendMessage}>Send</button>
    </div>
  );
};

export default LiveChat;
