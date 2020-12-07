import * as actions from '../actions/actions';
import { types, util } from 'vortex-api';


const zEditReducer: types.IReducerSpec = {
    reducers: {
        [actions.setzEditPath as any]: (state, payload) => util.setSafe(state, ['path'], payload.path),
        [actions.setzEditProfile as any]: 
            (state, payload) => util.setSafe(state, ['profiles', payload.gameId], payload.name)
    },
    defaults: {}
};

export default zEditReducer;