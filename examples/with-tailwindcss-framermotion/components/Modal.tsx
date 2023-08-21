import { motion, Transition } from 'framer-motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  closeButtonColor?: string;
  blurPx?: string;
  animationType?: string; 

  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  closeButtonColor,
  blurPx,
  animationType,
  children,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, backdropFilter: 'blur(0)' }}
      animate={{
        opacity: isOpen ? 1 : 0,
        backdropFilter: isOpen ? `blur(${blurPx || '10px'})` : 'blur(0)',
      }}
      transition={{ duration: 0.5, ease: animationType || 'ease' }}
      className={`w-full fixed inset-0 flex items-center justify-center ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div className="bg-gray-800 backdrop-filter backdrop-blur-lg bg-opacity-50 rounded-3xl py-5 px-5 w-full h-full">
        <button
          onClick={onClose}
          className={`mt-4 px-5 py-5 rounded-3xl bg-${closeButtonColor || 'blue'}-600 text-white rounded-3xl`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>

        <div className="pt-4">{children}</div>
      </div>
    </motion.div>
  );
};

export default Modal;
