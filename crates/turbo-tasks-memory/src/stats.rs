use std::{
    cmp::{self, max},
    collections::{hash_map::Entry, HashMap, HashSet, VecDeque},
    fmt::Display,
    mem::take,
    time::Duration,
};

use turbo_tasks::{registry, FunctionId, TaskId, TraitTypeId};

use crate::{
    task::{Task, TaskStatsInfo},
    MemoryBackend,
};

#[derive(PartialEq, Eq, Hash, Clone, Debug)]
pub enum TaskType {
    Root(TaskId),
    Once(TaskId),
    Native(FunctionId),
    ResolveNative(FunctionId),
    ResolveTrait(TraitTypeId, String),
}

impl Display for TaskType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskType::Root(_) => write!(f, "root"),
            TaskType::Once(_) => write!(f, "once"),
            TaskType::Native(nf) => write!(f, "{}", registry::get_function(*nf).name),
            TaskType::ResolveNative(nf) => {
                write!(f, "resolve {}", registry::get_function(*nf).name)
            }
            TaskType::ResolveTrait(t, n) => {
                write!(f, "resolve trait {}::{}", registry::get_trait(*t).name, n)
            }
        }
    }
}

#[derive(Default, Clone, Debug)]
pub struct ReferenceStats {
    pub count: usize,
}

#[derive(PartialEq, Eq, Hash, Clone, Debug, Copy)]
pub enum ReferenceType {
    Child,
    Dependency,
    Input,
}

#[derive(Clone, Debug)]
pub struct TaskStats {
    pub count: usize,
    pub active_count: usize,
    pub executions: usize,
    pub roots: usize,
    pub scopes: usize,
    pub total_duration: Duration,
    pub total_current_duration: Duration,
    pub total_update_duration: Duration,
    pub max_duration: Duration,
    pub references: HashMap<(ReferenceType, TaskType), ReferenceStats>,
}

impl Default for TaskStats {
    fn default() -> Self {
        Self {
            count: 0,
            active_count: 0,
            executions: 0,
            roots: 0,
            scopes: 0,
            total_duration: Duration::ZERO,
            total_current_duration: Duration::ZERO,
            total_update_duration: Duration::ZERO,
            max_duration: Duration::ZERO,
            references: Default::default(),
        }
    }
}

pub struct Stats {
    tasks: HashMap<TaskType, TaskStats>,
}

impl Default for Stats {
    fn default() -> Self {
        Self::new()
    }
}

impl Stats {
    pub fn new() -> Self {
        Self {
            tasks: Default::default(),
        }
    }

    pub fn add(&mut self, backend: &MemoryBackend, task: &Task) {
        self.add_conditional(backend, task, |_, info| info.executions > 0)
    }

    pub fn add_conditional(
        &mut self,
        backend: &MemoryBackend,
        task: &Task,
        condition: impl FnOnce(&TaskType, &TaskStatsInfo) -> bool,
    ) {
        let info = task.get_stats_info(backend);
        let ty = task.get_stats_type();
        if !condition(&ty, &info) {
            return;
        }
        let TaskStatsInfo {
            total_duration,
            last_duration,
            executions,
            root_scoped,
            child_scopes,
            active,
        } = info;
        let stats = self.tasks.entry(ty).or_default();
        stats.count += 1;
        if active {
            stats.active_count += 1
        }
        stats.total_duration += total_duration;
        stats.total_current_duration += last_duration;
        if executions > 1 {
            stats.total_update_duration += last_duration;
        }
        stats.max_duration = max(stats.max_duration, last_duration);
        stats.executions += executions as usize;
        if root_scoped {
            stats.roots += 1;
        }
        stats.scopes += child_scopes;

        let (references, _) = task.get_stats_references();
        let set: HashSet<_> = references.into_iter().collect();
        for (ref_type, task) in set {
            backend.with_task(task, |task| {
                let ty = task.get_stats_type();
                let ref_stats = stats.references.entry((ref_type, ty)).or_default();
                ref_stats.count += 1;
            })
        }
    }

    pub fn add_id(&mut self, backend: &MemoryBackend, id: TaskId) {
        backend.with_task(id, |task| {
            self.add(backend, task);
        });
    }

    pub fn add_id_conditional(
        &mut self,
        backend: &MemoryBackend,
        id: TaskId,
        condition: impl FnOnce(&TaskType, &TaskStatsInfo) -> bool,
    ) {
        backend.with_task(id, |task| {
            self.add_conditional(backend, task, condition);
        });
    }

    pub fn merge_resolve(&mut self) {
        self.merge(|ty, _stats| match ty {
            TaskType::Root(_) | TaskType::Once(_) | TaskType::Native(_) => false,
            TaskType::ResolveNative(_) | TaskType::ResolveTrait(_, _) => true,
        })
    }

    pub fn merge(&mut self, mut select: impl FnMut(&TaskType, &TaskStats) -> bool) {
        let merged: HashMap<_, _> = self
            .tasks
            .drain_filter(|ty, stats| select(ty, stats))
            .collect();

        for stats in self.tasks.values_mut() {
            fn merge_refs(
                refs: HashMap<(ReferenceType, TaskType), ReferenceStats>,
                merged: &HashMap<TaskType, TaskStats>,
            ) -> HashMap<(ReferenceType, TaskType), ReferenceStats> {
                refs.into_iter()
                    .flat_map(|((ref_ty, ty), stats)| {
                        if let Some(merged_stats) = merged.get(&ty) {
                            if ref_ty == ReferenceType::Child {
                                merge_refs(merged_stats.references.clone(), merged)
                                    .into_iter()
                                    .map(|((ref_ty, ty), _)| ((ref_ty, ty), stats.clone()))
                                    .collect()
                            } else {
                                vec![]
                            }
                        } else {
                            vec![((ref_ty, ty), stats)]
                        }
                    })
                    .collect()
            }
            stats.references = merge_refs(take(&mut stats.references), &merged);
        }
    }

    pub fn treeify(&self, tree_ref_type: ReferenceType) -> GroupTree {
        let mut incoming_references_count = self
            .tasks
            .keys()
            .map(|ty| (ty, 0))
            .collect::<HashMap<_, usize>>();
        for stats in self.tasks.values() {
            for (ref_type, ty) in stats.references.keys() {
                if ref_type == &tree_ref_type {
                    *incoming_references_count.entry(ty).or_default() += 1;
                }
            }
        }
        let mut root_queue = incoming_references_count.into_iter().collect::<Vec<_>>();
        root_queue.sort_by_key(|(_, c)| *c);

        let mut task_placement: HashMap<&TaskType, Option<&TaskType>> = HashMap::new();
        fn get_path<'a>(
            ty: Option<&'a TaskType>,
            task_placement: &HashMap<&'a TaskType, Option<&'a TaskType>>,
        ) -> Vec<&'a TaskType> {
            if let Some(mut ty) = ty {
                let mut path = vec![ty];
                while let Some(parent) = task_placement[ty] {
                    ty = parent;
                    path.push(ty);
                }
                path.reverse();
                path
            } else {
                Vec::new()
            }
        }
        fn find_common<'a>(p1: Vec<&'a TaskType>, p2: Vec<&'a TaskType>) -> Option<&'a TaskType> {
            let mut i = cmp::min(p1.len(), p2.len());
            loop {
                if i == 0 {
                    return None;
                }
                i -= 1;
                if p1[i] == p2[i] {
                    return Some(p1[i]);
                }
            }
        }
        for (root, _) in root_queue.into_iter() {
            if task_placement.contains_key(root) {
                continue;
            }
            let mut queue: VecDeque<(&TaskType, Option<&TaskType>)> =
                [(root, None)].into_iter().collect();

            while let Some((ty, placement)) = queue.pop_front() {
                match task_placement.entry(ty) {
                    Entry::Occupied(e) => {
                        let current_placement = *e.get();
                        if placement != current_placement {
                            let new_placement = find_common(
                                get_path(placement, &task_placement),
                                get_path(current_placement, &task_placement),
                            );
                            task_placement.insert(ty, new_placement);
                        }
                    }
                    Entry::Vacant(e) => {
                        if let Some(task) = self.tasks.get(ty) {
                            e.insert(placement);

                            for (ref_type, child_ty) in task.references.keys() {
                                if ref_type == &tree_ref_type {
                                    queue.push_back((child_ty, Some(ty)));
                                }
                            }
                        }
                    }
                }
            }
        }

        let mut children: HashMap<Option<&TaskType>, Vec<&TaskType>> = HashMap::new();
        for (child, parent) in task_placement {
            children.entry(parent).or_default().push(child);
        }

        fn into_group<'a>(
            tasks: &HashMap<TaskType, TaskStats>,
            children: &HashMap<Option<&'a TaskType>, Vec<&'a TaskType>>,
            ty: Option<&'a TaskType>,
        ) -> GroupTree {
            let inner = &children[&ty];
            let inner_with_children = inner.iter().filter(|c| children.contains_key(&Some(*c)));
            let leafs = inner.iter().filter(|c| !children.contains_key(&Some(*c)));
            let task_types: Vec<_> = leafs.map(|&ty| (ty.clone(), tasks[ty].clone())).collect();
            GroupTree {
                primary: ty.map(|ty| (ty.clone(), tasks[ty].clone())),
                children: inner_with_children
                    .map(|ty| into_group(tasks, children, Some(ty)))
                    .collect(),
                task_types,
            }
        }

        if children.is_empty() {
            GroupTree {
                primary: None,
                children: Vec::new(),
                task_types: Vec::new(),
            }
        } else {
            into_group(&self.tasks, &children, None)
        }
    }
}

#[derive(Debug)]
pub struct GroupTree {
    pub primary: Option<(TaskType, TaskStats)>,
    pub children: Vec<GroupTree>,
    pub task_types: Vec<(TaskType, TaskStats)>,
}
