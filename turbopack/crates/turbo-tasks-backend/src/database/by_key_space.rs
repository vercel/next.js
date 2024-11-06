use crate::database::key_value_database::KeySpace;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ByKeySpace<T> {
    infra: T,
    task_meta: T,
    task_data: T,
    forward_task_cache: T,
    reverse_task_cache: T,
}

impl<T> ByKeySpace<T> {
    pub fn new(mut factory: impl FnMut(KeySpace) -> T) -> Self {
        Self {
            infra: factory(KeySpace::Infra),
            task_meta: factory(KeySpace::TaskMeta),
            task_data: factory(KeySpace::TaskData),
            forward_task_cache: factory(KeySpace::ForwardTaskCache),
            reverse_task_cache: factory(KeySpace::ReverseTaskCache),
        }
    }

    pub fn try_new<E>(mut factory: impl FnMut(KeySpace) -> Result<T, E>) -> Result<Self, E> {
        Ok(Self {
            infra: factory(KeySpace::Infra)?,
            task_meta: factory(KeySpace::TaskMeta)?,
            task_data: factory(KeySpace::TaskData)?,
            forward_task_cache: factory(KeySpace::ForwardTaskCache)?,
            reverse_task_cache: factory(KeySpace::ReverseTaskCache)?,
        })
    }

    pub fn get(&self, key_space: KeySpace) -> &T {
        match key_space {
            KeySpace::Infra => &self.infra,
            KeySpace::TaskMeta => &self.task_meta,
            KeySpace::TaskData => &self.task_data,
            KeySpace::ForwardTaskCache => &self.forward_task_cache,
            KeySpace::ReverseTaskCache => &self.reverse_task_cache,
        }
    }

    pub fn get_mut(&mut self, key_space: KeySpace) -> &mut T {
        match key_space {
            KeySpace::Infra => &mut self.infra,
            KeySpace::TaskMeta => &mut self.task_meta,
            KeySpace::TaskData => &mut self.task_data,
            KeySpace::ForwardTaskCache => &mut self.forward_task_cache,
            KeySpace::ReverseTaskCache => &mut self.reverse_task_cache,
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = (KeySpace, &T)> {
        [
            (KeySpace::Infra, &self.infra),
            (KeySpace::TaskMeta, &self.task_meta),
            (KeySpace::TaskData, &self.task_data),
            (KeySpace::ForwardTaskCache, &self.forward_task_cache),
            (KeySpace::ReverseTaskCache, &self.reverse_task_cache),
        ]
        .into_iter()
    }

    pub fn values(&self) -> [&T; 5] {
        [
            &self.infra,
            &self.task_meta,
            &self.task_data,
            &self.forward_task_cache,
            &self.reverse_task_cache,
        ]
    }

    pub fn from_values(values: [T; 5]) -> Self {
        let [infra, task_meta, task_data, forward_task_cache, reverse_task_cache] = values;
        Self {
            infra,
            task_meta,
            task_data,
            forward_task_cache,
            reverse_task_cache,
        }
    }
}
