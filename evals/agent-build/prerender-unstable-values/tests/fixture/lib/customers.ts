import { cookies } from 'next/headers'
import { createCustomerClient, type Customer } from '@/lib/vendor/customer-sdk'

export const CUSTOMER_COOKIE = 'pulse_customer'

export async function getCurrentCustomer(): Promise<Customer | null> {
  const id = (await cookies()).get(CUSTOMER_COOKIE)?.value
  if (!id) return null

  return createCustomerClient().getCustomer(id)
}
