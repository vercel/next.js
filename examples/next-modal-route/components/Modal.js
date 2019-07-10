import React, { useImperativeHandle, forwardRef, useRef } from "react";

const modal = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  backgroundColor: "#00000052",
  zIndex: 10000
};

const content = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  borderRadius: "15px",
  padding: "15px",
  width: "100px",
  height: "100px",
  margin: "auto",
  backgroundColor: "#fff",
  zIndex: 10000000
};

const Modal = (props, ref) => {
  const _content = useRef(null);
  useImperativeHandle(ref, () => ({ _content }));

  return (
    <div style={modal} onClick={props.onClick}>
      <div ref={_content} style={content}>
        Hello i'm a modal Route
      </div>
    </div>
  );
};

export default forwardRef(Modal);
