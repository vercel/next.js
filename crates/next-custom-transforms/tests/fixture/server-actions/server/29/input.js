'use server'

export const dec = async (value) => {
  return value - 1
}

// Test case for https://github.com/vercel/next.js/issues/54655
export default dec
