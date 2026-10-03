"use client";

import { useRouter } from "next/navigation";
import Modal from "react-modal";

import Post from "../../../../components/Post";

Modal.setAppElement("body");

export default function PostModal({ postId }) {
  const router = useRouter();

  return (
    <Modal
      isOpen={true}
      onRequestClose={() => router.push("/")}
      contentLabel="Post modal"
    >
      <Post id={postId} pathname={`/post/${postId}`} />
    </Modal>
  );
}
