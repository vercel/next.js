import request from '@/utils/request'

const FETCH_DATA = 'newsListing/FETCH_DATA'
const FETCH_DATA_SUCCESS = 'newsListing/FETCH_DATA_SUCCESS'
const FETCH_DATA_FAIL = 'newsListing/FETCH_DATA_FAIL'

const initState = {
  fetching: false,
	articles: [],
};

export default function newsListing(state = initState, action) {
  switch (action.type) {
    case FETCH_DATA: {
      return {
        ...state,
        fetching: true,
      };
    }
    case FETCH_DATA_SUCCESS: {
      const { articles } = action.result;
      return {
        ...state,
        isFetching: false,
        articles,
      };
    }
    case FETCH_DATA_FAIL: {
      return {
        ...state,
        fetching: true,
      };
    }
    default:
      return state;
  }
}

const API_KEY = '2c19465b0ba44c10a0e873a0234bddc8'
const source = 'techcrunch'

export function fetchData({ sortBy }) {
  const url = `https://newsapi.org/v1/articles?source=${source}&sortBy=${sortBy}&apiKey=${API_KEY}`
  return {
    types: [FETCH_DATA, FETCH_DATA_SUCCESS, FETCH_DATA_FAIL],
    promise: () => request(url),
  }
}
