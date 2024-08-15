import { useState } from "react";
import { analytics } from "@/lib/segment";

export default function Form() {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analytics.track("Form Submitted", {
      message,
    });
    setMessage("");
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        <label>
          <span>Message:</span>
          <textarea
            onChange={(e) => setMessage(e.target.value)}
            value={message}
          />
        </label>
        <button type="submit">submit</button>
      </form>

      <style jsx>{`
        label span {
          display: block;
          margin-bottom: 12px;
        }

        textarea {
          min-width: 300px;
          min-height: 120px;
        }

        button {
          margin-top: 12px;
          display: block;
        }
      `}</style>
    </>
  );
}
