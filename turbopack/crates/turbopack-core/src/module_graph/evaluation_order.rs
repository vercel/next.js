//! Keeps the order in which modules are evaluated when modules are merged.
//!
//! A merged group is one module factory. Whoever imports one of its modules first runs all of
//! them: the entry points of the group one after the other, and every other module of the group
//! where a module of the group imports it. That is only what happens without merging if nothing
//! else is evaluated between the modules of the group, in every situation in which the group can
//! be evaluated.
//!
//! [`EvaluationOrder`] checks lists of modules that are candidates for merging against
//! [`EvaluationTrace`]s and splits each list into the groups that are safe to merge.
//!
//! # Example
//!
//! `v` imports `u`. Route `a` imports `s1`, a module `x` of its own, `s2` and `v`. Route `b`
//! imports `s1`, `s2` and `v`. Both routes import `s1`, `s2`, `u` and `v`, so these four are one
//! list, at the positions 0 to 3. The trace of `a` is `s1 x s2 u v`, the trace of `b` is
//! `s1 s2 u v`. For each module and its successor in the list, the traces give:
//!
//! | Module | `importer_min`, `importer_max` | `adjacent_from` |
//! |---|---|---|
//! | `s1` | none: no module of the list imports it | none: for `a`, `x` runs before `s2` starts |
//! | `s2` | none | 2: `u` starts right after `s2` |
//! | `u` | 3 and 3: `v` imports it first | none: `v` does not start after `u` |
//!
//! The list is cut from its end. `u` stays with `v`, which imports it first in every trace.
//! `s2` is an entry point, and it stays because the group reaches position 2. `s1` is cut off.
//! The group is `s2 u v` with the entry points `s2` and `v`.
//!
//! If `b` imported `u` itself before `v`, `u` would be an entry point for `b` and not for `a`
//! (`importer_min` 3, `importer_max` none). The group would end before `v` then, although
//! `u v` is the order for both routes.

use std::{hash::Hash, ops::Range, sync::Arc};

use rustc_hash::FxHashMap;

/// Marks a position that does not exist, and compares higher than every position.
const NONE: u32 = u32::MAX;

/// The modules that one module evaluates when it is loaded before anything else was evaluated, in
/// the order of a depth-first search over the imports that are evaluated before the importing
/// module.
///
/// A module that is not followed into its own imports still has to be recorded: it is evaluated
/// between the modules around it.
pub(crate) struct EvaluationTrace<M> {
    indices: FxHashMap<M, u32>,
    modules: Vec<TracedModule<M>>,
    /// The modules in the order in which their evaluation completes, as indices into `modules`.
    completed: Vec<u32>,
}

struct TracedModule<M> {
    module: M,
    /// The number of modules that were completely evaluated when this one was entered. The
    /// modules from that position in `completed` up to this module are what it evaluates.
    first: u32,
    /// The position in `completed`, `NONE` while the module is being evaluated.
    position: u32,
    /// The module that imported this one first, as an index into `modules`.
    importer: u32,
    /// Whether the module was imported again while it was being evaluated: an import cycle.
    reentered: bool,
}

impl<M: Copy + Eq + Hash> EvaluationTrace<M> {
    pub(crate) fn new() -> Self {
        Self {
            indices: FxHashMap::default(),
            modules: Vec::new(),
            completed: Vec::new(),
        }
    }

    /// Records that `importer` imports `module`. Returns whether this is the import that
    /// evaluates the module. If so, [`Self::leave`] has to be called once the imports of the
    /// module are recorded.
    pub(crate) fn enter(&mut self, importer: Option<M>, module: M) -> bool {
        if let Some(&index) = self.indices.get(&module) {
            let module = &mut self.modules[index as usize];
            if module.position == NONE {
                module.reentered = true;
            }
            return false;
        }
        let importer = importer.map_or(NONE, |importer| self.indices[&importer]);
        self.indices.insert(module, self.modules.len() as u32);
        self.modules.push(TracedModule {
            module,
            first: self.completed.len() as u32,
            position: NONE,
            importer,
            reentered: false,
        });
        true
    }

    /// Records that the evaluation of `module` is complete.
    pub(crate) fn leave(&mut self, module: M) {
        let index = self.indices[&module];
        self.modules[index as usize].position = self.completed.len() as u32;
        self.completed.push(index);
    }

    /// Empties the trace to record another one.
    pub(crate) fn clear(&mut self) {
        self.indices.clear();
        self.modules.clear();
        self.completed.clear();
    }
}

/// What the traces allow for one module of a list and its successor in the list.
#[derive(Clone)]
struct ModuleOrder {
    /// The module and its successor must not be in one group.
    split: bool,
    /// As an entry point, the module can be in one group with its successor if the last module
    /// of the group has this position or a higher one: the next entry point of the group then
    /// starts right after the module.
    adjacent_from: u32,
    /// The lowest and the highest position, over all traces, of the module of this list that
    /// imports this module first. `NONE` where no later module of the list does. In a group whose
    /// last module has a lower position, the module is an entry point.
    importer_min: u32,
    importer_max: u32,
}

#[derive(Clone)]
struct ListOrder {
    /// Whether a trace evaluates the modules of the list.
    traced: bool,
    modules: Vec<ModuleOrder>,
}

/// The references to a module of a list, for the lists that can be evaluated again while they are
/// being evaluated.
#[derive(Clone)]
pub(crate) struct Referrers {
    /// Whether the module is referenced by a module that is not in the list, or can be loaded
    /// without a reference from the list.
    pub(crate) outside: bool,
    /// The lowest and the highest position of a module of the list that references the module.
    pub(crate) first: u32,
    pub(crate) last: u32,
}

impl Default for Referrers {
    fn default() -> Self {
        Self {
            outside: false,
            first: NONE,
            last: 0,
        }
    }
}

/// Splits lists of modules that are candidates for merging into groups that are evaluated like
/// their modules are evaluated one by one.
///
/// A group is a range of a list. Its entry points are the modules that no module of the group
/// imports first. A group is kept when all of this holds in every trace that evaluates it:
/// - the trace evaluates the modules of the group in the order of the list, with no other module of
///   the list between them,
/// - each entry point starts right after the module before it in the list is complete, so that
///   everything the trace evaluates between the first and the last module of the group is evaluated
///   by the group itself,
/// - no module that is evaluated at that point imports itself again through a module of the group
///   that is not part of it (an import cycle through the group),
/// - the entry points are the same modules as in every other trace.
///
/// The module documentation has an example.
#[derive(Clone)]
pub(crate) struct EvaluationOrder<M> {
    /// The list and the position in the list of every module.
    positions: Arc<FxHashMap<M, (u32, u32)>>,
    lists: Vec<ListOrder>,
}

impl<M: Copy + Eq + Hash> EvaluationOrder<M> {
    pub(crate) fn new<L: IntoIterator<Item = M>>(lists: impl IntoIterator<Item = L>) -> Self {
        let mut positions = FxHashMap::default();
        let lists = lists
            .into_iter()
            .enumerate()
            .map(|(list, modules)| {
                let mut len = 0;
                for module in modules {
                    positions.insert(module, (list as u32, len));
                    len += 1;
                }
                ListOrder {
                    traced: false,
                    modules: vec![
                        ModuleOrder {
                            split: false,
                            adjacent_from: 0,
                            importer_min: NONE,
                            importer_max: 0,
                        };
                        len as usize
                    ],
                }
            })
            .collect();
        Self {
            positions: Arc::new(positions),
            lists,
        }
    }

    /// The list and the position in the list of a module.
    pub(crate) fn position(&self, module: M) -> Option<(usize, usize)> {
        self.positions
            .get(&module)
            .map(|&(list, position)| (list as usize, position as usize))
    }

    /// Restricts the groups to what one more trace allows.
    ///
    /// The trace has to evaluate all modules of a list or none of them, as the trace of a merge
    /// group entry does for modules that the same merge group entries import.
    pub(crate) fn add_trace(&mut self, trace: &EvaluationTrace<M>) {
        // The list and the position of every module of the trace.
        let positions = trace
            .modules
            .iter()
            .map(|module| {
                self.positions
                    .get(&module.module)
                    .copied()
                    .unwrap_or((NONE, NONE))
            })
            .collect::<Vec<_>>();
        let completed = &trace.completed;
        let trace = PositionedTrace {
            modules: &trace.modules,
            positions: &positions,
        };

        // The module of each list that the trace evaluated last: its position in the list and its
        // index in the trace.
        let mut last: FxHashMap<u32, (u32, u32)> = FxHashMap::default();
        for &index in completed {
            let (list, position) = positions[index as usize];
            if list == NONE {
                continue;
            }
            let order = &mut self.lists[list as usize];
            order.traced = true;
            let module = &mut order.modules[position as usize];
            let importer = trace.importer_position(index);
            module.importer_min = module.importer_min.min(importer);
            module.importer_max = module.importer_max.max(importer);

            match last.insert(list, (position, index)) {
                Some((previous, previous_index)) if previous + 1 == position => {
                    let adjacent_from = trace.adjacent_from(previous_index, index);
                    let module = &mut order.modules[previous as usize];
                    module.adjacent_from = module.adjacent_from.max(adjacent_from);
                }
                // The trace evaluates another module before this one than the list has there.
                // Every pair of neighbors that the trace does not evaluate one after the other
                // is found here, at its second module, because the trace evaluates both.
                _ if position > 0 => order.modules[position as usize - 1].split = true,
                _ => {}
            }
        }
    }

    /// Restricts the groups to what the traces of `other`, a clone of this value, allow too.
    pub(crate) fn merge(&mut self, other: &Self) {
        for (order, other) in self.lists.iter_mut().zip(&other.lists) {
            order.traced |= other.traced;
            for (module, other) in order.modules.iter_mut().zip(&other.modules) {
                module.split |= other.split;
                module.adjacent_from = module.adjacent_from.max(other.adjacent_from);
                module.importer_min = module.importer_min.min(other.importer_min);
                module.importer_max = module.importer_max.max(other.importer_max);
            }
        }
    }

    /// The groups of a list, as ranges of positions. A range of one module is a module that is
    /// not merged.
    ///
    /// `referrers` is passed for a list that can be evaluated again while it is being evaluated.
    /// Every module that is imported at that point has to be the single entry point of its group
    /// then, so that it is found in the same state with and without merging. So such a group has
    /// one entry point, and no other module of it is referenced from outside.
    pub(crate) fn groups(&self, list: usize, referrers: Option<&[Referrers]>) -> Vec<Range<usize>> {
        let order = &self.lists[list];
        let Some(mut end) = order.modules.len().checked_sub(1) else {
            return Vec::new();
        };
        let mut groups = Vec::new();
        for position in (0..end).rev() {
            let module = &order.modules[position];
            let last = end as u32;
            let keep = order.traced
                && !module.split
                // A module that a module of the group imports first in every trace is evaluated
                // there, as without merging. A module that none of them imports first in any
                // trace is an entry point, and the next one has to start right after it.
                && (module.importer_max <= last
                    || (module.adjacent_from <= last && last < module.importer_min))
                && referrers.is_none_or(|referrers| {
                    let referrers = &referrers[position];
                    !referrers.outside
                        && referrers.first > position as u32
                        && referrers.last <= last
                });
            if !keep {
                groups.push(position + 1..end + 1);
                end = position;
            }
        }
        groups.push(0..end + 1);
        groups.reverse();
        groups
    }

    /// The positions of the entry points of a group that [`Self::groups`] returned, in the order
    /// in which they are evaluated.
    pub(crate) fn entry_points(
        &self,
        list: usize,
        group: Range<usize>,
    ) -> impl Iterator<Item = usize> + '_ {
        let last = group.end as u32 - 1;
        let modules = &self.lists[list].modules;
        group.filter(move |&position| modules[position].importer_max > last)
    }
}

/// A trace together with the list and the position in the list of each of its modules.
struct PositionedTrace<'a, M> {
    modules: &'a [TracedModule<M>],
    positions: &'a [(u32, u32)],
}

impl<M> PositionedTrace<'_, M> {
    /// The position of the module that imports `index` first, if that is a later module of the
    /// same list.
    fn importer_position(&self, index: u32) -> u32 {
        let importer = self.modules[index as usize].importer;
        if importer == NONE {
            return NONE;
        }
        let (list, position) = self.positions[index as usize];
        let (importer_list, importer_position) = self.positions[importer as usize];
        if importer_list == list && importer_position > position {
            importer_position
        } else {
            NONE
        }
    }

    /// [`ModuleOrder::adjacent_from`] of `previous` in this trace. `previous` and `next` follow
    /// each other in a list, and the trace evaluates them in this order with no other module of
    /// the list between them.
    ///
    /// With `end` as the position of the last module of the group, the entry point that evaluates
    /// `next` is the last module that is reached from `next` by following the first importers
    /// while they are in the list and at most at `end`.
    fn adjacent_from(&self, previous: u32, next: u32) -> u32 {
        // The first module that is evaluated after `previous`.
        let after_previous = self.modules[previous as usize].position + 1;
        let mut adjacent_from = NONE;

        let mut index = next;
        let mut in_list = true;
        loop {
            let module = &self.modules[index as usize];
            if module.first < after_previous {
                // This module is evaluated around `previous`, like every module that imports it.
                break;
            }
            if in_list {
                // An entry point has to start right after `previous`. A module that is entered
                // there and imported again while it is evaluated has to be in the group: outside
                // of it, the merged group would evaluate it instead of finding it in evaluation.
                if module.first == after_previous && (adjacent_from == NONE || module.reentered) {
                    adjacent_from = self.positions[index as usize].1;
                }
            } else if module.reentered {
                // This one can't be in the group.
                adjacent_from = NONE;
                break;
            }
            if module.importer == NONE {
                break;
            }
            if in_list && self.importer_position(index) == NONE {
                in_list = false;
            }
            index = module.importer;
        }
        adjacent_from
    }
}

#[cfg(test)]
mod tests {
    use rustc_hash::FxHashSet;

    use super::*;

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum Reference {
        /// An `import`: the module is evaluated before the importing module.
        Import,
        /// A `require()` that runs before the body of the importing module.
        RequireFirst,
        /// A `require()` that runs after the body of the importing module.
        RequireLast,
        /// A `require()` inside a function: it runs when the test loads the module.
        Later,
    }
    use Reference::*;

    /// A module graph without the module contents: every module has one side effect, its number.
    #[derive(Default)]
    struct Graph {
        /// The references of every module, in source order.
        references: Vec<Vec<(usize, Reference)>>,
        /// The modules that are not ES modules. They are never merged.
        not_mergeable: FxHashSet<usize>,
        entries: Vec<usize>,
        /// The entries of every chunk group.
        chunk_groups: Vec<Vec<usize>>,
    }

    type Group = (Vec<usize>, Vec<usize>);

    impl Graph {
        fn new(entries: &[usize], references: &[&[(usize, Reference)]]) -> Self {
            Self {
                references: references.iter().map(|r| r.to_vec()).collect(),
                not_mergeable: FxHashSet::default(),
                entries: entries.to_vec(),
                chunk_groups: vec![entries.to_vec()],
            }
        }

        /// The same graph with one chunk group per entry, as for the routes of an application.
        fn with_a_chunk_group_per_entry(mut self) -> Self {
            self.chunk_groups = self.entries.iter().map(|&entry| vec![entry]).collect();
            self
        }

        /// Whether the reference is evaluated before the importing module and the bitmap of the
        /// importing module is inherited.
        fn inherits(&self, from: usize, to: usize, reference: Reference) -> bool {
            reference == Import
                && !self.not_mergeable.contains(&from)
                && !self.not_mergeable.contains(&to)
        }

        fn reachable(&self) -> Vec<usize> {
            let mut seen = FxHashSet::default();
            let mut stack = self.entries.clone();
            let mut result = vec![];
            while let Some(m) = stack.pop() {
                if seen.insert(m) {
                    result.push(m);
                    stack.extend(self.references[m].iter().map(|&(to, _)| to));
                }
            }
            result.sort_unstable();
            result
        }

        /// The modules that start a merge group: the entries and the targets of references that
        /// don't inherit.
        fn roots(&self) -> Vec<usize> {
            let mut roots = self.entries.clone();
            for from in self.reachable() {
                for &(to, reference) in &self.references[from] {
                    if !self.inherits(from, to, reference) && !roots.contains(&to) {
                        roots.push(to);
                    }
                }
            }
            roots
        }

        /// For every module the roots that import it through references that inherit.
        fn bitmaps(&self, roots: &[usize]) -> Vec<Vec<usize>> {
            let mut bitmaps = vec![vec![]; self.references.len()];
            for (bit, &root) in roots.iter().enumerate() {
                let mut stack = vec![root];
                while let Some(m) = stack.pop() {
                    if bitmaps[m].contains(&bit) {
                        continue;
                    }
                    bitmaps[m].push(bit);
                    for &(to, reference) in &self.references[m] {
                        if self.inherits(m, to, reference) {
                            stack.push(to);
                        }
                    }
                }
            }
            bitmaps
        }

        fn trace(&self, root: usize) -> EvaluationTrace<usize> {
            fn visit(graph: &Graph, trace: &mut EvaluationTrace<usize>, module: usize) {
                for &(to, reference) in &graph.references[module] {
                    if reference == Import && to != module && trace.enter(Some(module), to) {
                        if graph.inherits(module, to, reference) {
                            visit(graph, trace, to);
                        }
                        trace.leave(to);
                    }
                }
            }
            let mut trace = EvaluationTrace::new();
            trace.enter(None, root);
            visit(self, &mut trace, root);
            trace.leave(root);
            trace
        }

        /// The lists of one chunk group: the modules of each bitmap, in the order of a
        /// depth-first search that follows every reference.
        fn chunk_group_lists(&self, entries: &[usize], bitmaps: &[Vec<usize>]) -> Vec<Vec<usize>> {
            fn visit(graph: &Graph, seen: &mut FxHashSet<usize>, order: &mut Vec<usize>, m: usize) {
                if seen.insert(m) {
                    for &(to, _) in &graph.references[m] {
                        visit(graph, seen, order, to);
                    }
                    order.push(m);
                }
            }
            let mut seen = FxHashSet::default();
            let mut order = vec![];
            for &entry in entries {
                visit(self, &mut seen, &mut order, entry);
            }
            let mut lists: Vec<Vec<usize>> = vec![];
            for m in order {
                if self.not_mergeable.contains(&m) {
                    continue;
                }
                match lists.iter_mut().find(|l| bitmaps[l[0]] == bitmaps[m]) {
                    Some(list) => list.push(m),
                    None => lists.push(vec![m]),
                }
            }
            lists
        }

        /// The lists that the chunk groups give. A module that is in the lists of several chunk
        /// groups stays in one list: the lists are cut around the longest sequence that starts
        /// with the module in all of them.
        fn candidates(&self, bitmaps: &[Vec<usize>]) -> Vec<Vec<usize>> {
            let mut lists: Vec<Vec<usize>> = vec![];
            // The list and the position of every occurrence of a module, and the modules in the
            // order in which they are listed first.
            let mut occurrences = vec![vec![]; self.references.len()];
            let mut queue = vec![];
            for chunk_group in &self.chunk_groups {
                for list in self.chunk_group_lists(chunk_group, bitmaps) {
                    for (position, &m) in list.iter().enumerate() {
                        if occurrences[m].is_empty() {
                            queue.push(m);
                        }
                        occurrences[m].push((lists.len(), position));
                    }
                    lists.push(list);
                }
            }

            // The modules with the lowest position first.
            queue.sort_by_key(|&m| {
                std::cmp::Reverse(occurrences[m].iter().map(|&(_, position)| position).min())
            });
            while let Some(m) = queue.pop() {
                let common = std::mem::take(&mut occurrences[m]);
                if common.len() < 2 {
                    continue;
                }
                let (first_list, first_position) = common[0];
                let mut len = 1;
                while lists[first_list]
                    .get(first_position + len)
                    .is_some_and(|&next| {
                        common
                            .iter()
                            .all(|&(list, position)| lists[list].get(position + len) == Some(&next))
                    })
                {
                    len += 1;
                }
                let common_list = lists[first_list][first_position..first_position + len].to_vec();
                for (position, &m) in common_list.iter().enumerate().skip(1) {
                    occurrences[m] = vec![(lists.len(), position)];
                }
                lists.push(common_list);
                for &(list, position) in &common {
                    let after = lists[list].split_off(position + len);
                    lists[list].truncate(position);
                    for (after_position, &m) in after.iter().enumerate() {
                        for occurrence in &mut occurrences[m] {
                            if *occurrence == (list, position + len + after_position) {
                                *occurrence = (lists.len(), after_position);
                            }
                        }
                    }
                    lists.push(after);
                }
            }
            lists.retain(|l| l.len() > 1);
            lists
        }

        /// The roots, as indices into `roots`, that are ES modules and part of an import cycle:
        /// such a root can be loaded while a module that it imports is being evaluated.
        fn reentrant_roots(&self, roots: &[usize]) -> Vec<usize> {
            (0..roots.len())
                .filter(|&bit| {
                    let root = roots[bit];
                    let mut seen = FxHashSet::default();
                    let mut stack = vec![root];
                    while let Some(m) = stack.pop() {
                        for &(to, _) in &self.references[m] {
                            if to == root && m != root {
                                return !self.not_mergeable.contains(&root);
                            }
                            if seen.insert(to) {
                                stack.push(to);
                            }
                        }
                    }
                    false
                })
                .collect()
        }

        /// The groups that are merged: the modules and the entry points of each.
        fn groups(&self, lists: &[Vec<usize>]) -> Vec<Group> {
            let roots = self.roots();
            let bitmaps = self.bitmaps(&roots);
            let reentrant = self.reentrant_roots(&roots);
            let mut order = EvaluationOrder::new(lists.iter().map(|l| l.iter().copied()));
            // Every second trace goes to a clone, as when the traces are recorded in parallel.
            let mut other = order.clone();
            for (i, &root) in roots.iter().enumerate() {
                if !self.not_mergeable.contains(&root) {
                    let order = if i % 2 == 0 { &mut order } else { &mut other };
                    order.add_trace(&self.trace(root));
                }
            }
            order.merge(&other);
            let mut groups = vec![];
            for (list_idx, list) in lists.iter().enumerate() {
                let is_reentrant = bitmaps[list[0]].iter().any(|bit| reentrant.contains(bit));
                let referrers = is_reentrant.then(|| {
                    let mut referrers = list
                        .iter()
                        .map(|m| Referrers {
                            outside: roots.contains(m),
                            ..Default::default()
                        })
                        .collect::<Vec<_>>();
                    for from in self.reachable() {
                        for &(to, _) in &self.references[from] {
                            let Some(to) = list.iter().position(|&m| m == to) else {
                                continue;
                            };
                            match list.iter().position(|&m| m == from) {
                                Some(from) if from != to => {
                                    referrers[to].first = referrers[to].first.min(from as u32);
                                    referrers[to].last = referrers[to].last.max(from as u32);
                                }
                                Some(_) => {}
                                None => referrers[to].outside = true,
                            }
                        }
                    }
                    referrers
                });
                for group in order.groups(list_idx, referrers.as_deref()) {
                    if group.len() > 1 {
                        groups.push((
                            list[group.clone()].to_vec(),
                            order
                                .entry_points(list_idx, group)
                                .map(|position| list[position])
                                .collect(),
                        ));
                    }
                }
            }
            groups
        }

        /// The groups of the lists that one chunk group gives.
        fn merged(&self) -> Vec<Group> {
            self.groups(&self.candidates(&self.bitmaps(&self.roots())))
        }

        /// The order in which the modules run their side effect when `loads` are loaded one after
        /// the other, with the given groups as one module factory each.
        fn evaluate(&self, groups: &[Group], loads: &[usize]) -> Vec<usize> {
            struct Evaluation<'a> {
                graph: &'a Graph,
                groups: &'a [Group],
                group_of: Vec<Option<usize>>,
                started: Vec<bool>,
                order: Vec<usize>,
            }
            impl Evaluation<'_> {
                fn body(&mut self, module: usize) {
                    let graph = self.graph;
                    for &(to, reference) in &graph.references[module] {
                        if reference == RequireFirst {
                            self.load(to);
                        }
                    }
                    self.order.push(module);
                    for &(to, reference) in &graph.references[module] {
                        if reference == RequireLast {
                            self.load(to);
                        }
                    }
                }

                /// What `__turbopack_context__.i()` and `require()` do.
                fn load(&mut self, module: usize) {
                    // An import of a module that is being evaluated gets the exports that exist
                    // so far.
                    if std::mem::replace(&mut self.started[module], true) {
                        return;
                    }
                    if let Some(group) = self.group_of[module] {
                        // One factory for the group. The import of a module of the group whose
                        // code has not started runs the factory, also when the factory is
                        // running: all modules of the group are then evaluated a second time.
                        // No group may be imported like that.
                        let groups = self.groups;
                        let mut inlined = FxHashSet::default();
                        for &entry_point in &groups[group].1 {
                            self.inline(group, entry_point, &mut inlined);
                        }
                        return;
                    }
                    let graph = self.graph;
                    for &(to, reference) in &graph.references[module] {
                        if reference == Import {
                            self.load(to);
                        }
                    }
                    self.body(module);
                }

                /// The code of a module inside the factory of its group: the code of an imported
                /// module of the group is placed at the first import of it, except for the entry
                /// points, which are placed one after the other.
                fn inline(&mut self, group: usize, module: usize, inlined: &mut FxHashSet<usize>) {
                    if !inlined.insert(module) {
                        return;
                    }
                    self.started[module] = true;
                    let graph = self.graph;
                    let groups = self.groups;
                    for &(to, reference) in &graph.references[module] {
                        if reference != Import {
                            continue;
                        }
                        if self.group_of[to] != Some(group) {
                            self.load(to);
                        } else if !groups[group].1.contains(&to) {
                            self.inline(group, to, inlined);
                        }
                    }
                    self.body(module);
                }
            }

            let mut group_of = vec![None; self.references.len()];
            for (idx, (modules, _)) in groups.iter().enumerate() {
                for &m in modules {
                    group_of[m] = Some(idx);
                }
            }
            let mut evaluation = Evaluation {
                graph: self,
                groups,
                group_of,
                started: vec![false; self.references.len()],
                order: vec![],
            };
            for &module in loads {
                evaluation.load(module);
            }
            evaluation.order
        }

        /// Asserts that the groups don't change the evaluation order, whichever root is loaded
        /// first.
        fn assert_same_order(&self, groups: &[Group]) {
            for root in self.roots() {
                assert_eq!(
                    self.evaluate(groups, &[root]),
                    self.evaluate(&[], &[root]),
                    "loading {root} with the groups {groups:?}"
                );
            }
        }
    }

    #[test]
    fn modules_that_follow_each_other_in_every_trace_are_merged() {
        // 0 and 1 both import 2 and then 3.
        let graph = Graph::new(
            &[0, 1],
            &[
                &[(2, Import), (3, Import)],
                &[(2, Import), (3, Import)],
                &[],
                &[],
            ],
        );
        assert_eq!(graph.merged(), vec![(vec![2, 3], vec![2, 3])]);
        graph.assert_same_order(&graph.merged());
    }

    #[test]
    fn a_module_between_two_shared_modules_splits_them() {
        // 0 imports 2, 4, 3 and 1 imports 2, 3: merging 2 and 3 would run 3 before 4.
        let graph = Graph::new(
            &[0, 1],
            &[
                &[(2, Import), (4, Import), (3, Import)],
                &[(2, Import), (3, Import)],
                &[],
                &[],
                &[],
            ],
        );
        assert_eq!(
            graph.candidates(&graph.bitmaps(&graph.roots())),
            [[2, 3], [4, 0]]
        );
        assert_eq!(graph.merged(), vec![(vec![4, 0], vec![0])]);
        graph.assert_same_order(&graph.merged());
        // What merging the candidates as they are would do.
        let unchecked = [(vec![2, 3], vec![2, 3])];
        assert_eq!(graph.evaluate(&unchecked, &[0]), [2, 3, 4, 0]);
        assert_eq!(graph.evaluate(&[], &[0]), [2, 4, 3, 0]);
    }

    #[test]
    fn a_module_that_a_later_require_shares_is_not_merged_with_it() {
        // 0 imports 1 (which imports 4), 2, and 3 (which imports 5). 0 also requires 5 in a
        // function. 5 imports 4. So 4 and 5 are imported by the same roots (0 and 5), and
        // merging them would run 5 when 1 imports 4: before 1 and 2.
        let graph = Graph::new(
            &[0],
            &[
                &[(1, Import), (2, Import), (3, Import), (5, Later)],
                &[(4, Import)],
                &[],
                &[(5, Import)],
                &[],
                &[(4, Import)],
            ],
        );
        assert_eq!(
            graph.candidates(&graph.bitmaps(&graph.roots())),
            [vec![4, 5], vec![1, 2, 3, 0]]
        );
        assert_eq!(graph.merged(), vec![(vec![1, 2, 3, 0], vec![0])]);
        graph.assert_same_order(&graph.merged());
        let unchecked = [(vec![4, 5], vec![5]), (vec![1, 2, 3, 0], vec![0])];
        assert_eq!(graph.evaluate(&unchecked, &[0]), [4, 5, 1, 2, 3, 0]);
        assert_eq!(graph.evaluate(&[], &[0]), [4, 1, 2, 5, 3, 0]);
    }

    #[test]
    fn modules_of_one_importer_stay_merged_around_an_import_of_another_group() {
        // 0 imports 2, 3 (which 1 imports too) and 4: 2, 4 and 0 are one group with the entry
        // point 0, and 0 imports 3 between 2 and 4.
        let graph = Graph::new(
            &[0, 1],
            &[
                &[(2, Import), (3, Import), (4, Import)],
                &[(3, Import)],
                &[],
                &[],
                &[],
            ],
        );
        assert_eq!(graph.merged(), vec![(vec![2, 4, 0], vec![0])]);
        graph.assert_same_order(&graph.merged());
    }

    #[test]
    fn a_module_that_is_not_merged_between_two_modules_splits_them() {
        // 0 and 1 import 2, 3 and 4, and 3 is not an ES module: it runs between 2 and 4.
        let mut graph = Graph::new(
            &[0, 1],
            &[
                &[(2, Import), (3, Import), (4, Import)],
                &[(2, Import), (3, Import), (4, Import)],
                &[],
                &[],
                &[],
            ],
        );
        graph.not_mergeable.insert(3);
        assert_eq!(graph.candidates(&graph.bitmaps(&graph.roots())), [[2, 4]]);
        assert_eq!(graph.merged(), vec![]);
    }

    #[test]
    fn an_import_cycle_is_merged_when_every_root_enters_it_at_the_same_module() {
        // 0 imports 1, 1 imports 2, 2 imports 1.
        let graph = Graph::new(&[0], &[&[(1, Import)], &[(2, Import)], &[(1, Import)]]);
        assert_eq!(graph.merged(), vec![(vec![2, 1, 0], vec![0])]);
        graph.assert_same_order(&graph.merged());

        // A second root enters the cycle at 2: 1 and 2 run in another order then.
        let graph = Graph::new(
            &[0, 3],
            &[
                &[(1, Import)],
                &[(2, Import)],
                &[(1, Import)],
                &[(2, Import)],
            ],
        );
        assert_eq!(graph.merged(), vec![]);
    }

    #[test]
    fn a_group_that_is_loaded_while_it_is_evaluated_has_one_way_in() {
        // 0 imports 1, 2 (not an ES module) and 3. 2 requires 4, which imports 0 and 5, and 5
        // imports 3. So while 0 is evaluated, 5 imports 3 before 0 does. A factory for 1, 3 and
        // 0 has not started 3 at that point, so that import runs the factory a second time.
        let mut graph = Graph::new(
            &[0],
            &[
                &[(1, Import), (2, Import), (3, Import)],
                &[],
                &[(4, RequireFirst)],
                &[],
                &[(0, Import), (5, Import)],
                &[(3, Import)],
            ],
        );
        graph.not_mergeable.insert(2);
        assert_eq!(
            graph.candidates(&graph.bitmaps(&graph.roots())),
            [vec![1, 3, 0], vec![5, 4]]
        );
        assert_eq!(graph.merged(), vec![(vec![5, 4], vec![4])]);
        graph.assert_same_order(&graph.merged());
        let unchecked = [(vec![1, 3, 0], vec![0])];
        assert_eq!(
            graph.evaluate(&unchecked, &[0]),
            [1, 1, 3, 0, 5, 4, 2, 3, 0]
        );
        assert_eq!(graph.evaluate(&[], &[0]), [1, 3, 5, 4, 2, 0]);
    }

    #[test]
    fn a_module_that_is_an_entry_point_for_one_entry_only_is_not_merged() {
        // 3 imports 2. 0 imports 3, and 1 imports 2 and then 3: 2 is an entry point for 1, and
        // 3 imports it first for 0. 2 before 3 is the order in both, so merging them would be
        // right here: the check gives this case up.
        let graph = Graph::new(
            &[0, 1],
            &[
                &[(3, Import)],
                &[(2, Import), (3, Import)],
                &[],
                &[(2, Import)],
            ],
        )
        .with_a_chunk_group_per_entry();
        assert_eq!(graph.candidates(&graph.bitmaps(&graph.roots())), [[2, 3]]);
        assert_eq!(graph.merged(), vec![]);
        let unchecked = [(vec![2, 3], vec![2, 3])];
        graph.assert_same_order(&unchecked);

        // With 4, which is not an ES module, before 2 in 3, merging them would run 2 before 4
        // for 0.
        let mut graph = Graph::new(
            &[0, 1],
            &[
                &[(3, Import)],
                &[(2, Import), (3, Import)],
                &[],
                &[(4, Import), (2, Import)],
                &[],
            ],
        )
        .with_a_chunk_group_per_entry();
        graph.not_mergeable.insert(4);
        assert_eq!(graph.merged(), vec![]);
        assert_eq!(graph.evaluate(&unchecked, &[0]), [2, 4, 3, 0]);
        assert_eq!(graph.evaluate(&[], &[0]), [4, 2, 3, 0]);
    }

    #[test]
    fn an_importer_of_two_entry_points_is_not_merged_with_them() {
        // 0 imports 2, 3 and 4, 1 imports 4, and 4 imports 2 and 3. 2 and 3 are entry points
        // for 0, so 4 stays out, and 2 and 3 don't need it.
        let graph = Graph::new(
            &[0, 1],
            &[
                &[(2, Import), (3, Import), (4, Import)],
                &[(4, Import)],
                &[],
                &[],
                &[(2, Import), (3, Import)],
            ],
        );
        assert_eq!(
            graph.candidates(&graph.bitmaps(&graph.roots())),
            [[2, 3, 4]]
        );
        assert_eq!(graph.merged(), vec![(vec![2, 3], vec![2, 3])]);
        graph.assert_same_order(&graph.merged());
    }

    #[test]
    fn modules_below_an_import_cycle_are_merged() {
        // 0 imports 5, which imports 2, 3 and 4, and 2 imports 5 again. 1 imports 3 and 4. 5
        // is evaluated around 3 and 4, so the second import of it does not matter to them.
        let graph = Graph::new(
            &[0, 1],
            &[
                &[(5, Import)],
                &[(3, Import), (4, Import)],
                &[(5, Import)],
                &[],
                &[],
                &[(2, Import), (3, Import), (4, Import)],
            ],
        );
        assert_eq!(
            graph.merged(),
            vec![(vec![2, 5, 0], vec![0]), (vec![3, 4], vec![3, 4])]
        );
        graph.assert_same_order(&graph.merged());
    }

    #[test]
    fn the_example_of_the_module_documentation() {
        // 0 and 1 are the routes `a` and `b`, 2 is `s1`, 3 is `x`, 4 is `s2`, 5 is `u`, 6 is `v`.
        let graph = Graph::new(
            &[0, 1],
            &[
                &[(2, Import), (3, Import), (4, Import), (6, Import)],
                &[(2, Import), (4, Import), (6, Import)],
                &[],
                &[],
                &[],
                &[],
                &[(5, Import)],
            ],
        );
        assert_eq!(
            graph.candidates(&graph.bitmaps(&graph.roots())),
            [vec![2, 4, 5, 6], vec![3, 0]]
        );
        assert_eq!(
            graph.merged(),
            vec![(vec![4, 5, 6], vec![4, 6]), (vec![3, 0], vec![0])]
        );
        graph.assert_same_order(&graph.merged());

        // `b` imports `u` itself.
        let graph = Graph::new(
            &[0, 1],
            &[
                &[(2, Import), (3, Import), (4, Import), (6, Import)],
                &[(2, Import), (4, Import), (5, Import), (6, Import)],
                &[],
                &[],
                &[],
                &[],
                &[(5, Import)],
            ],
        );
        assert_eq!(
            graph.merged(),
            vec![(vec![4, 5], vec![4, 5]), (vec![3, 0], vec![0])]
        );
        graph.assert_same_order(&graph.merged());
    }

    #[test]
    fn a_list_that_no_trace_evaluates_is_not_merged() {
        let order = EvaluationOrder::new([[1, 2]]);
        assert_eq!(order.groups(0, None), [0..1, 1..2]);

        let mut order = EvaluationOrder::new([[1, 2]]);
        let mut trace = EvaluationTrace::new();
        trace.enter(None, 2);
        trace.enter(Some(2), 1);
        trace.leave(1);
        trace.leave(2);
        order.add_trace(&trace);
        assert_eq!(order.groups(0, None), [0..2]);
        assert_eq!(order.entry_points(0, 0..2).collect::<Vec<_>>(), [1]);
    }

    /// Deterministic pseudo-random numbers (xorshift64).
    struct Random(u64);

    impl Random {
        fn new(seed: u64) -> Self {
            Self(seed.wrapping_mul(0x9E3779B97F4A7C15) | 1)
        }

        fn next(&mut self, bound: usize) -> usize {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            (self.0 % bound as u64) as usize
        }
    }

    /// Deterministic pseudo-random graphs: up to twelve modules with up to four references each,
    /// of every kind, some of them backwards (cycles), and some modules that are not ES modules.
    fn generate_graph(random: &mut Random) -> Graph {
        let mut next = |bound: usize| random.next(bound);
        let len = 2 + next(11);
        let mut graph = Graph {
            references: vec![vec![]; len],
            ..Default::default()
        };
        for from in 0..len {
            if from > 0 && next(100) < 10 {
                graph.not_mergeable.insert(from);
            }
            for _ in 0..next(5) {
                let to = if next(100) < 10 {
                    next(len)
                } else if from + 1 < len {
                    from + 1 + next(len - from - 1)
                } else {
                    continue;
                };
                if to == from {
                    continue;
                }
                let reference = if graph.not_mergeable.contains(&from) {
                    [RequireFirst, RequireFirst, RequireLast, Later][next(4)]
                } else {
                    [
                        Import,
                        Import,
                        Import,
                        Import,
                        Import,
                        Import,
                        Import,
                        Later,
                        RequireFirst,
                        RequireLast,
                    ][next(10)]
                };
                graph.references[from].push((to, reference));
            }
        }
        graph.entries.push(0);
        for _ in 0..next(3) {
            let entry = next(len);
            if !graph.entries.contains(&entry) {
                graph.entries.push(entry);
            }
        }
        // Every entry starts a chunk group, or shares the one of the entry before it.
        for &entry in &graph.entries {
            match graph.chunk_groups.last_mut() {
                Some(chunk_group) if next(3) == 0 => chunk_group.push(entry),
                _ => graph.chunk_groups.push(vec![entry]),
            }
        }
        graph
    }

    /// Lists that no chunk group gives: the modules of each bitmap in the order of one
    /// depth-first search from all entries, without some of the modules, and with some neighbors
    /// swapped.
    fn arbitrary_lists(
        graph: &Graph,
        bitmaps: &[Vec<usize>],
        random: &mut Random,
    ) -> Vec<Vec<usize>> {
        let mut lists = graph.chunk_group_lists(&graph.entries, bitmaps);
        for list in &mut lists {
            list.retain(|_| random.next(4) > 0);
            for i in 1..list.len() {
                if random.next(8) == 0 {
                    list.swap(i - 1, i);
                }
            }
        }
        lists.retain(|l| l.len() > 1);
        lists
    }

    #[test]
    fn merged_groups_keep_the_evaluation_order_of_random_graphs() {
        let mut merged_modules = [0, 0];
        let mut unchecked_differs = 0;
        // The first 20,000 seeds, and seeds of graphs that need conditions which those don't.
        for seed in (1..=20000).chain([25209, 35291, 55124, 209372, 735377]) {
            let mut random = Random::new(seed);
            let graph = generate_graph(&mut random);
            let roots = graph.roots();
            let bitmaps = graph.bitmaps(&roots);

            // Every root on its own, and all roots one after the other, forwards and backwards.
            let mut loads = roots.iter().map(|&root| vec![root]).collect::<Vec<_>>();
            loads.push(roots.clone());
            loads.push(roots.iter().rev().copied().collect());
            let unmerged = loads
                .iter()
                .map(|loads| graph.evaluate(&[], loads))
                .collect::<Vec<_>>();
            let differs = |groups: &[Group]| {
                loads
                    .iter()
                    .zip(&unmerged)
                    .find(|(loads, unmerged)| graph.evaluate(groups, loads) != **unmerged)
                    .map(|(loads, _)| loads.clone())
            };

            // The lists that the chunk groups give, and lists that they don't give: the groups
            // must not depend on how the candidates are found.
            let candidates = graph.candidates(&bitmaps);
            let arbitrary = arbitrary_lists(&graph, &bitmaps, &mut random);
            for (lists, merged_modules) in [&candidates, &arbitrary]
                .into_iter()
                .zip(&mut merged_modules)
            {
                let groups = graph.groups(lists);
                assert_eq!(
                    differs(&groups),
                    None,
                    "seed {seed}, lists {lists:?}, groups {groups:?}, references {:?}, not \
                     mergeable {:?}, chunk groups {:?}",
                    graph.references,
                    graph.not_mergeable,
                    graph.chunk_groups
                );
                *merged_modules += groups
                    .iter()
                    .map(|(modules, _)| modules.len())
                    .sum::<usize>();
            }

            // The candidates as they are, with the modules that no module of the list imports as
            // entry points.
            let unchecked = candidates
                .iter()
                .map(|list| {
                    let entry_points = list
                        .iter()
                        .copied()
                        .filter(|&m| {
                            !list
                                .iter()
                                .any(|&from| graph.references[from].contains(&(m, Import)))
                        })
                        .collect::<Vec<_>>();
                    (list.clone(), entry_points)
                })
                .filter(|(_, entry_points)| !entry_points.is_empty())
                .collect::<Vec<_>>();
            if differs(&unchecked).is_some() {
                unchecked_differs += 1;
            }
        }
        // The check is neither vacuous nor does it give up merging.
        eprintln!("STATS unchecked_differs={unchecked_differs} merged_modules={merged_modules:?}");
        assert!(unchecked_differs > 200, "{unchecked_differs}");
        assert!(merged_modules[0] > 30000, "{merged_modules:?}");
    }
}
