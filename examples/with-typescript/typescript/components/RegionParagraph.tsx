import * as React from 'react'
export default class extends React.Component<RegionParagraphProps, null> {
    getVisitString() {
        if (typeof this.props.data.visitInfo == 'number')
            return 'Visited this fine country in the summer of ' + this.props.data.visitInfo;
        else
            //auto complete for Date object because if visitInfo is not a number it must be a date
            return 'Visited this fine country on the ' + this.props.data.visitInfo.getDate() + '. '
    }
    render() {
        return <p>
            {this.props.data.name + ': ' + this.getVisitString()}
        </p>
    }
}