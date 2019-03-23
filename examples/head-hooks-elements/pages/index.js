import { useState, useContext } from "react";
import withDocumentTitle, { DocTitleContext } from "../components/withDocumentTitle";

export default withDocumentTitle(() => {
    const { dispatch } = useContext(DocTitleContext);
    const [counter, setCounter] = useState(0);
    const add = () => {
        setCounter(counter + 1);
        dispatch({
            type: 'CHANGE_TITLE',
            title: 'adding 1...'
        })
    };
    const subtract = () => {
        setCounter(counter - 1);
        dispatch({
            type: 'CHANGE_TITLE',
            title: `subtract 1...`
        })
    };
    return (
        <div>
            <h1>{counter}</h1>
            <button onClick={add}>+</button>
            <button onClick={subtract}>-</button>
        </div>
    )
});