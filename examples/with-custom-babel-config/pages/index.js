import { useState, useEffect } from "react";

const MyLuckNo = () => {
  const [randomNumber, setRandomNumber] = useState(null);

  const recalculate = () => {
    setRandomNumber(Math.ceil(Math.random() * 100));
  };

  useEffect(() => {
    recalculate();
  }, []);

  const message = do {
    if (randomNumber < 30) {
      // eslint-disable-next-line no-unused-expressions
      ("Do not give up. Try again.");
    } else if (randomNumber < 60) {
      // eslint-disable-next-line no-unused-expressions
      ("You are a lucky guy");
    } else {
      // eslint-disable-next-line no-unused-expressions
      ("You are soooo lucky!");
    }
  };

  if (randomNumber === null) return <p>Please wait..</p>;
  return (
    <div>
      <h3>Your Lucky number is: "{randomNumber}"</h3>
      <p>{message}</p>
      <button onClick={() => recalculate()}>Try Again</button>
    </div>
  );
};

export default MyLuckNo;
