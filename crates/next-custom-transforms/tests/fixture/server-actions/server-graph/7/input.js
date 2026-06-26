import { Button } from 'components'
import deleteFromDb from 'db'

export function Item1(product, foo, bar) {
  const a = async function deleteItem1() {
    'use server'
    await deleteFromDb(
      product.id,
      product?.foo,
      product.bar.baz,
      product[
        // @ts-expect-error: deliberate useless comma
        (foo, bar)
      ]
    )
  }
  return <Button action={a}>Delete</Button>
}

export function Item2(product, foo, bar) {
  async function deleteItem2() {
    'use server'
    await deleteFromDb(
      product.id,
      product?.foo,
      product.bar.baz,
      product[
        // @ts-expect-error: deliberate useless comma
        (foo, bar)
      ]
    )
  }
  return <Button action={deleteItem2}>Delete</Button>
}

export function Item3(product, foo, bar) {
  const deleteItem3 = async function () {
    'use server'
    await deleteFromDb(
      product.id,
      product?.foo,
      product.bar.baz,
      product[
        // @ts-expect-error: deliberate useless comma
        (foo, bar)
      ]
    )
  }
  return <Button action={deleteItem3}>Delete</Button>
}

export function Item4(product, foo, bar) {
  const deleteItem4 = async () => {
    'use server'
    await deleteFromDb(
      product.id,
      product?.foo,
      product.bar.baz,
      product[
        // @ts-expect-error: deliberate useless comma
        (foo, bar)
      ]
    )
  }
  return <Button action={deleteItem4}>Delete</Button>
}
