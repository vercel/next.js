import Modal from '../components/Modal'
import Button from '../components/Button'
import { useState } from 'react';
import type { NextPage } from 'next'

const Home: NextPage = () => {
  const [modalOpen, setModalOpen] = useState(false);

  const handleModalToggle = () => {
    setModalOpen(!modalOpen);
  };

  return (
    <>
      <Button text="Open Modal" backgroundColor="blue-600" onClick={handleModalToggle} />
      <Modal isOpen={modalOpen} onClose={handleModalToggle} closeButtonColor="blue-600" animationType="easeInOut" blurPx="10px">
        <h1 className="text-center font-extrabold bg-gradient-to-r to-white from-black  text-transparent  bg-clip-text delay-150 duration-100 animate-ping">Welcome to Next.js Application</h1>
      </Modal>

      
    </>
  );
}
export default Home;
