import { getDataGraphs } from './actions';

const initialState = {
    loading: false,
    loadend: false,
    error: null,
    data: [],
};

function exampleReducer(state = initialState, { type, payload }) {
    switch (type) {
        case getDataGraphs.REQUEST:
            return { ...state, loading: true };

        case getDataGraphs.SUCCESS:
            return { ...state, loading: false, loadend: true, data: payload };

        case getDataGraphs.FAILURE:
            return { ...state, loading: false, loadend: false, error: payload };

        default:
            return state;
    }
}

export default exampleReducer;
