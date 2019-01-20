import { createSelector } from 'reselect';

export const selectGraphsDomain = state => state.example;

export const selectData = createSelector(
    selectGraphsDomain,
    subState => (subState && subState.data) || []
);
