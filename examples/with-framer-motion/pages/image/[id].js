import * as React from 'react';
import SingleImage from "../../components/SingleImage";

import useInitialRouter from '../../hooks/useInitialRouter';

const Page = () => {
    const router = useInitialRouter();
    const id = router && router.query.id;

    return <SingleImage id={id} />;
}
export default Page;