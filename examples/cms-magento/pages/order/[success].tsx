import { motion } from 'framer-motion'
import Link from 'next/link'

import Layout from 'components/Layout'

const containerVariants = {
  hidden: {
    opacity: 0,
    y: '-100vw',
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      mass: 0.4,
      damping: 8,
      when: 'beforeChildren',
      staggerChildren: 0.4,
    },
  },
}

const childVariants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
  },
}

const OrderSuccessPage = () => {
  return (
    <Layout>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="text-center mt-5"
      >
        <h2>Thank You!</h2>
        <motion.h4 variants={childVariants}>
          Your Order has been Placed Successfully!!
        </motion.h4>

        <Link href="/">
          <motion.a variants={childVariants} style={{ cursor: 'pointer' }}>
            <strong>CONTINUE SHOPPING</strong>
          </motion.a>
        </Link>
      </motion.div>
    </Layout>
  )
}

export default OrderSuccessPage
