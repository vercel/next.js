use crate::analyzer::{JsValue, ObjectPart};

// Visiting
impl<'a> JsValue<'a> {
    /// Calls a function for each child of the node. Allows mutating the node.
    /// Updates the total nodes count after mutation.
    pub fn for_each_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue<'a>) -> bool,
    ) -> bool {
        match self {
            JsValue::Alternatives {
                total_nodes: _,
                values: list,
                logical_property: _,
            }
            | JsValue::Concat(_, list)
            | JsValue::Add(_, list)
            | JsValue::Logical(_, _, list)
            | JsValue::Array { items: list, .. } => {
                let mut modified = false;
                for item in list.iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Not(_, value) => {
                let modified = visitor(value);
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Object { parts, .. } => {
                let mut modified = false;
                for item in parts.iter_mut() {
                    match item {
                        ObjectPart::KeyValue(key, value) => {
                            if visitor(key) {
                                modified = true
                            }
                            if visitor(value) {
                                modified = true
                            }
                        }
                        ObjectPart::Spread(value) => {
                            if visitor(value) {
                                modified = true
                            }
                        }
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::New(_, call) => {
                let modified = call.for_each_children_mut(visitor);
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Call(_, call) => {
                let modified = call.for_each_children_mut(visitor);
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::SuperCall(_, args) => {
                let mut modified = false;
                for item in args.iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::MemberCall(_, call) => {
                let modified = call.for_each_children_mut(visitor);

                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Function(_, _, return_value) => {
                let modified = visitor(return_value);

                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Binary(_, a, _, b) => {
                let m1 = visitor(a);
                let m2 = visitor(b);
                let modified = m1 || m2;
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Tenary(_, test, cons, alt) => {
                let m1 = visitor(test);
                let m2 = visitor(cons);
                let m3 = visitor(alt);
                let modified = m1 || m2 || m3;
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Member(_, obj, prop) => {
                let m1 = visitor(obj);
                let m2 = visitor(prop);
                let modified = m1 || m2;
                if modified {
                    self.update_total_nodes();
                }
                modified
            }

            JsValue::Iterated(_, operand)
            | JsValue::TypeOf(_, operand)
            | JsValue::Promise(_, operand)
            | JsValue::Awaited(_, operand) => {
                let modified = visitor(operand);
                if modified {
                    self.update_total_nodes();
                }
                modified
            }

            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::Url(_, _)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown { .. }
            | JsValue::Argument(..) => false,
        }
    }

    /// Calls a function for only early children. Allows mutating the
    /// node. Updates the total nodes count after mutation.
    pub fn for_each_early_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue<'a>) -> bool,
    ) -> bool {
        match self {
            JsValue::New(_, call) if !call.args().is_empty() => {
                let m = visitor(call.callee_mut());
                if m {
                    self.update_total_nodes();
                }
                m
            }
            JsValue::Call(_, call) if !call.args().is_empty() => {
                let m = visitor(call.callee_mut());
                if m {
                    self.update_total_nodes();
                }
                m
            }
            JsValue::MemberCall(_, call) if !call.args().is_empty() => {
                let m1 = visitor(call.prop_mut());
                let m2 = visitor(call.obj_mut());
                let modified = m1 || m2;
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Member(_, obj, _) => {
                let m = visitor(obj);
                if m {
                    self.update_total_nodes();
                }
                m
            }
            _ => false,
        }
    }

    /// Calls a function for only late children. Allows mutating the
    /// node. Updates the total nodes count after mutation.
    pub fn for_each_late_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue<'a>) -> bool,
    ) -> bool {
        match self {
            JsValue::New(_, call) if !call.args().is_empty() => {
                let mut modified = false;
                for item in call.args_mut().iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Call(_, call) if !call.args().is_empty() => {
                let mut modified = false;
                for item in call.args_mut().iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::MemberCall(_, call) if !call.args().is_empty() => {
                let mut modified = false;
                for item in call.args_mut().iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Member(_, _, prop) => {
                let m = visitor(prop);
                if m {
                    self.update_total_nodes();
                }
                m
            }
            _ => self.for_each_children_mut(visitor),
        }
    }

    /// Visit the node and all its children with a function.
    pub fn visit(&self, visitor: &mut impl FnMut(&JsValue<'a>)) {
        self.for_each_children(&mut |value| value.visit(visitor));
        visitor(self);
    }

    /// Calls a function for all children of the node.
    pub fn for_each_children(&self, visitor: &mut impl FnMut(&JsValue<'a>)) {
        match self {
            JsValue::Alternatives {
                total_nodes: _,
                values: list,
                logical_property: _,
            }
            | JsValue::Concat(_, list)
            | JsValue::Add(_, list)
            | JsValue::Logical(_, _, list)
            | JsValue::Array { items: list, .. } => {
                for item in list.iter() {
                    visitor(item);
                }
            }
            JsValue::Not(_, value) => {
                visitor(value);
            }
            JsValue::Object { parts, .. } => {
                for item in parts.iter() {
                    match item {
                        ObjectPart::KeyValue(key, value) => {
                            visitor(key);
                            visitor(value);
                        }
                        ObjectPart::Spread(value) => {
                            visitor(value);
                        }
                    }
                }
            }
            JsValue::New(_, call) => {
                call.for_each_children(visitor);
            }
            JsValue::Call(_, call) => {
                call.for_each_children(visitor);
            }
            JsValue::SuperCall(_, args) => {
                for item in args.iter() {
                    visitor(item);
                }
            }
            JsValue::MemberCall(_, call) => {
                call.for_each_children(visitor);
            }
            JsValue::Function(_, _, return_value) => {
                visitor(return_value);
            }
            JsValue::Member(_, obj, prop) => {
                visitor(obj);
                visitor(prop);
            }
            JsValue::Binary(_, a, _, b) => {
                visitor(a);
                visitor(b);
            }
            JsValue::Tenary(_, test, cons, alt) => {
                visitor(test);
                visitor(cons);
                visitor(alt);
            }

            JsValue::Iterated(_, operand)
            | JsValue::TypeOf(_, operand)
            | JsValue::Promise(_, operand)
            | JsValue::Awaited(_, operand) => {
                visitor(operand);
            }

            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::Url(_, _)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown { .. }
            | JsValue::Argument(..) => {}
        }
    }
}
