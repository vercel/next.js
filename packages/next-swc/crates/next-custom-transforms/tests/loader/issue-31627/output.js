import { _ as _class_call_check } from "@swc/helpers/_/_class_call_check";
import { useEffect } from "react";
import { select, selectAll } from "d3-selection";
export default function Home() {
    useEffect(function() {
        new MyClass();
    }, []);
    return /*#__PURE__*/ React.createElement("svg", null, /*#__PURE__*/ React.createElement("g", {
        className: "group"
    }, /*#__PURE__*/ React.createElement("path", null), /*#__PURE__*/ React.createElement("path", null)), /*#__PURE__*/ React.createElement("g", {
        className: "group"
    }, /*#__PURE__*/ React.createElement("path", null), /*#__PURE__*/ React.createElement("path", null)));
}
var MyClass = function MyClass() {
    "use strict";
    _class_call_check(this, MyClass);
    selectAll(".group").each(function() {
        select(this).selectAll("path");
    });
};
