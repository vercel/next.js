import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Modal from "../components/Modal";

const App = () => {
  const [modal, setModal] = useState(false);

  const _modal = useRef(null);

  const handleClick = () => {
    setModal(true);
    window.history.pushState("", "", "/test");
  };

  const closeModal = e => {
    if (!modal) return;
    if (_modal.current._content.current.contains(e.target)) return;
    setModal(false);
    window.history.go(-1);
  };

  const handleChange = e => {
    if (e.target.location.pathname === "/test") {
      setModal(true);
    }
    if (e.target.location.pathname === "/") {
      setModal(false);
    }
  };

  useEffect(() => {
    window.onpopstate = handleChange;
    () => window.removeEventListener("popstate", handleChange);
  });

  return (
    <div>
      {modal && <Modal ref={_modal} onClick={closeModal} />}
      <h2>Simple modal route with next js</h2>
      <button onClick={handleClick} style={{ marginBottom: "30px" }}>
        Open Modal
      </button>
      <br />
      <Link href={"/test"}>
        <a>Open Page</a>
      </Link>
    </div>
  );
};

export default App;
