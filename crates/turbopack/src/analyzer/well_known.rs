use swc_atoms::JsWord;
use swc_ecmascript::ast::Lit;

use super::{JsValue, WellKnownFunctionKind, WellKnownObjectKind};

pub fn replace_well_known(value: JsValue) -> (JsValue, bool) {
    match value {
        JsValue::Call(box JsValue::WellKnownFunction(kind), args) => {
            (well_known_function_call(kind, JsValue::Unknown, args), true)
        }
        JsValue::Member(box JsValue::WellKnownObject(kind), prop) => {
            (well_known_object_member(kind, prop), true)
        }
        _ => (value, false),
    }
}

pub fn well_known_function_call(
    kind: WellKnownFunctionKind,
    _this: JsValue,
    args: Vec<JsValue>,
) -> JsValue {
    match kind {
        WellKnownFunctionKind::PathJoin => path_join(args),
        WellKnownFunctionKind::Import => JsValue::Unknown,
        WellKnownFunctionKind::Require => require(args),
        WellKnownFunctionKind::RequireResolve => JsValue::Unknown,
        _ => JsValue::Unknown,
    }
}

pub fn path_join(args: Vec<JsValue>) -> JsValue {
    // Currently we only support constants.
    if args.iter().any(|arg| !matches!(arg, JsValue::Constant(..))) {
        JsValue::Unknown
    } else {
        let mut str_args = vec![];

        for arg in args.iter() {
            match arg {
                JsValue::Constant(v) => match v {
                    Lit::Str(v) => {
                        str_args.push(&*v.value);
                    }
                    _ => {
                        todo!()
                    }
                },
                _ => {}
            }
        }

        let joined = str_args.join("/");

        let mut res: Vec<&str> = vec![];

        for comp in joined.split("/") {
            match comp {
                "." => {}
                ".." => {
                    if let Some(last) = res.last() {
                        if &**last != ".." {
                            res.pop();
                            continue;
                        }
                    }

                    // leftmost `..`
                    res.push("..");
                }
                _ => {
                    res.push(comp);
                }
            }
        }

        res.join("/").into()
    }
}

pub fn require(args: Vec<JsValue>) -> JsValue {
    if args.len() == 1 {
        match &args[0] {
            JsValue::Constant(Lit::Str(s)) => JsValue::Module(s.value.clone()),
            _ => JsValue::Unknown,
        }
    } else {
        JsValue::Unknown
    }
}

pub fn well_known_object_member(kind: WellKnownObjectKind, prop: JsWord) -> JsValue {
    match kind {
        WellKnownObjectKind::PathModule => path_module_member(prop),
        WellKnownObjectKind::FsModule => fs_module_member(prop),
        _ => JsValue::Unknown,
    }
}

pub fn path_module_member(prop: JsWord) -> JsValue {
    match &*prop {
        "join" => JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
        _ => JsValue::Unknown,
    }
}

pub fn fs_module_member(prop: JsWord) -> JsValue {
    match &*prop {
        "realpath" | "realpathSync" | "stat" | "statSync" | "existsSync" | "createReadStream"
        | "exists" | "open" | "openSync" | "readFile" | "readFileSync" => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::FsReadMethod(prop))
        }
        "promises" => JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
        _ => JsValue::Unknown,
    }
}
