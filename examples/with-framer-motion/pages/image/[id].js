import * as React from 'react';
import SingleImage from "../../components/SingleImage";

import useId from '../../hooks/useId';

const Page = () => {
    const id = useId();
    return <SingleImage id={id} />;
}
export default Page;