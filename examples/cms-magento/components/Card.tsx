import { FC } from 'react'
import cookie from 'js-cookie'
import { useForm } from 'react-hook-form'
import { useSelector } from 'react-redux'
import FadeIn from 'react-fade-in'
import { motion } from 'framer-motion'
import Lottie from 'react-lottie'

import useCart from 'hooks/useCart'

import { IProduct } from 'interfaces/product'
import { IInitialState } from 'interfaces/state'

// import animationData from 'lottie/loader.json';
import successAnimation from 'lottie/success.json'

type Inputs = {
  quantity: Number
  sku: string
}

// const defaultOptions = {
//   loop: true,
//   autoplay: true,
//   animationData,
//   rendererSettings: {
//     preserveAspectRatio: 'xMidYMid slice',
//   },
// };

const item = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
  },
}

const successOptions = {
  loop: false,
  autoplay: true,
  animationData: successAnimation,
  rendererSettings: {
    preserveAspectRatio: 'xMidYMid slice',
  },
}

const Card: FC<IProduct> = (product) => {
  const token = cookie.get('token')

  const { register, handleSubmit } = useForm<Inputs>()
  const { addToCart } = useCart()

  const { loading, success, id, guestId, customerId } = useSelector(
    (state: IInitialState) => state
  )
  const onSubmit = async ({ quantity, sku }: Inputs) => {
    const item = {
      customerId,
      guestId,
      quantity,
      sku,
      token,
    }

    addToCart(item)
  }

  const imageUrl = product.image.url
  const price = product.price_range.maximum_price.final_price.value

  if (product.stock_status === 'OUT_OF_STOCK') {
    return null
  }

  return (
    <motion.div
      key={product.id}
      className="col-3 card mb-3 mx-4"
      variants={item}
    >
      <form className="mt-5" onSubmit={handleSubmit(onSubmit)}>
        <input
          type="hidden"
          name="sku"
          defaultValue={product.sku}
          ref={register}
        />
        <input type="hidden" name="quantity" defaultValue={1} ref={register} />
        <div className="card-body">
          <h5 className="card-title">{product.name}</h5>
        </div>
        <img src={imageUrl} className="img-fluid" alt={product.name} />
        <div className="card-body text-center">
          <p className="card-text">
            <strong>Rs. {price}</strong>{' '}
          </p>

          {product.sku === id && !!success ? (
            <FadeIn>
              <Lottie options={successOptions} height={50} width={120} />
            </FadeIn>
          ) : (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.8 }}
              type="submit"
              className="btn btn-primary"
              disabled={product.sku === id && loading}
            >
              {product.sku === id && loading ? 'ADDING' : 'ADD TO CART'}
            </motion.button>
          )}
        </div>
      </form>
      {/* <Message error={product.sku === id && error} /> */}
    </motion.div>
  )
}

export default Card
