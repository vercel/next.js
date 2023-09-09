import { ClientComponent } from './ClientComponent';
export default async function Page() {
    return <>

      <div>

        This fixture is to assert where the bootstrap scripts and other required

        scripts emit during SSR

      </div>

      <div>

        <ClientComponent/>

      </div>

    </>;
}
