import { RefreshButton } from '../../../../components/RefreshButton'
import { RevalidateButton } from '../../../../components/RevalidateButton'

const getRandom = async () => Math.random()

export default async function Page({ params }) {
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
      </div>
    </dialog>
  )
}
