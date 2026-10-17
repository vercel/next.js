"use client";

import { useRouter } from "next/navigation";
import Modal from "react-modal";

Modal.setAppElement("body");

export default function ArticleModal({ children }) {
  const router = useRouter();

  return (
    <Modal
      isOpen={true}
      onRequestClose={() => router.push("/")}
      contentLabel="Post modal"
    >
      {children}
    </Modal>
  );
}
