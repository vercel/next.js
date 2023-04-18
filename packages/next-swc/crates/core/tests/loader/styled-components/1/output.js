function _tagged_template_literal(strings, raw) {
    if (!raw) {
        raw = strings.slice(0);
    }
    return Object.freeze(Object.defineProperties(strings, {
        raw: {
            value: Object.freeze(raw)
        }
    }));
}
function _templateObject() {
    var data = _tagged_template_literal([
        "\n  color: red;\n"
    ]);
    _templateObject = function _templateObject() {
        return data;
    };
    return data;
}
import styled from "styled-components";
export var foo = styled.input.withConfig({
    displayName: "input__foo",
    componentId: "sc-12c52e68-0"
})(_templateObject());
