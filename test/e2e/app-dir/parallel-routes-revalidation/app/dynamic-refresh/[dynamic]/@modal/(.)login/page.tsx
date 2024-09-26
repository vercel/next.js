import { RefreshButton } from '../../../../components/RefreshButton'
import { RevalidateButton } from '../../../../components/RevalidateButton'
import { UpdateSearchParamsButton } from '../../../../components/UpdateSearchParamsButton'

const getRandom = async () => Math.random()

export default async function Page({ params, searchParams }) {
  const someProp = await getRandom()

  return (
    <dialog open>
      <div>{(await params).dynamic}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div>
          <span>Modal Page</span>
          <span id="modal-random">{someProp}</span>
        </div>
        <RefreshButton />
        <RevalidateButton />
        <UpdateSearchParamsButton
          searchParams={await searchParams}
          id="modal"
        />
      </div>
    </dialog>
  )
}
