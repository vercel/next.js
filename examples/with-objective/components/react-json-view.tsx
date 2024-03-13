"use client"

import ReactJson from "react-json-view"

const ReactJsonView = ({
    data,
    collapsed = false,
    fontSize = "0.75rem",
    padding = "1rem",
}: {
    data: any
    collapsed?: boolean | number
    fontSize?: string
    padding?: string
}) => {

    return (
        <div className="w-full">
            <ReactJson
                collapsed={collapsed}
                theme={"grayscale:inverted"}
                style={{
                    padding,
                    fontSize,
                    backgroundColor: "transparent",
                }}
                displayDataTypes={false}
                src={data}
                name={null}
                sortKeys={true}
                enableClipboard={false}
                displayObjectSize={false}
            />
        </div>
    )
}

export default ReactJsonView
