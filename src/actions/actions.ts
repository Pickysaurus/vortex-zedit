import { createAction } from 'redux-act';

export const setzEditPath = createAction('SET_ZEDIT_PATH', 
    (path: string) => ({ path }));

export const setzEditProfile = createAction('SET_ZEDIT_PROFILE',
    (gameId: string, name: string) => ({ gameId, name }));