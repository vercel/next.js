import { requireComponentDependancyByName } from '../dependancies'

export default function ContentZone(props) {
    function RenderModules() {
        let modulesToRender = [];
        let modules = props.page.zones[props.name];

        modules.forEach(m => {

            const AgilityModule = requireComponentDependancyByName(m.moduleName);

            modulesToRender.push(<AgilityModule key={m.item.contentID} {...m.item} />);
        })

        return modulesToRender;
    }


    return (
        <div>
            <RenderModules />
        </div>
    )
}
