"use client";

import { useFeatureGate } from "@statsig/react-bindings";

export default function GateCheck() {
  const gate = useFeatureGate("a_gate");

  return (
    <div
      style={{
        color: "white",
        fontSize: "20px",
        fontWeight: "bold",
        fontFamily: "sans-serif",
      }}
    >
      a_gate: {gate.value ? "Pass" : "Fail"}
    </div>
  );
}
