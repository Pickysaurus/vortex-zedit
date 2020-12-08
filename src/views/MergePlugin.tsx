import * as React from 'react';
import { ComponentEx, Icon } from 'vortex-api';
import { ListGroupItem } from 'react-bootstrap';
import { zEditMergePlugin } from '../types/zEditTypes';

interface IProps {
    className? : string;
    item: zEditMergePlugin;
}

class MergePlugin extends ComponentEx<IProps, {}> {

    public render() {
        const plugin = this.props.item;
        
        return (
            <ListGroupItem
                key={plugin.filename}
                ref={this.props.item.setRef}
                className='table-entry'
            >
                <span className='drag'><Icon name='sort-none' /></span>
                <span className='name' title={plugin.filename}>{plugin.filename}</span>
                <span className='status-icon'><Icon name={plugin.missing ? 'toggle-disabled' : 'toggle-enabled'} /></span>
                <span className='status-icon' title={plugin.mod?.attributes?.name || plugin.mod?.id || 'Not installed'}><Icon name={plugin.mod ? 'mods' : 'dialog-question'} /></span>
            </ListGroupItem>
        )
    }
}

export default (MergePlugin as any) as React.ComponentClass<{
    className?: string,
    item: any,
}>