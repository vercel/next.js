import { RefreshButton } from '../../../../components/RefreshButton'
import { RevalidateButton } from '../../../../components/RevalidateButton'
import { UpdateSearchParamsButton } from '../../../../components/UpdateSearchParamsButton'

const getRandom = async () => Math.random()

export default async function Page(props) {
  const searchParams = await props.searchParams
  const params = await props.params
  const someProp = await getRandom()

  return (
    <dialog open>
      <div>{params.dynamic}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div>
          <span>Modal Page</span>
          <span id="modal-random">{someProp}</span>
        </div>
        <RefreshButton />
        <RevalidateButton />
        <UpdateSearchParamsButton searchParams={searchParams} id="modal" />
      </div>
    </dialog>
  )
}
