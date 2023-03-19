'use client';

import styles from './styles.module.css';

const SkeletonCard = () => (
  <div className={styles.skeleton}>
    <div className={styles['skeleton-img']} />
    <div className={styles['skeleton-btn']} />
    <div className={styles['skeleton-line-one']} />
    <div className={styles['skeleton-line-two']} />
  </div>
);

export default function Page() {
  return (
    <div className="space-y-4">
      <div className="text-xl font-medium text-zinc-500">
        Styled with CSS Modules
      </div>
      <div className={styles.container}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
