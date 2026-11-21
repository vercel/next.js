import dynamic from 'next/dynamic'

const NestedIcon = dynamic(() => import('./nested/NestedIcon'))
const NestedBadge = dynamic(() => import('./nested/NestedBadge'))

export default function FeatureCard({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="feature-card">
      <div>
        <NestedIcon icon="star" />
        <h2>{title}</h2>
        <NestedBadge text="NEW" />
      </div>
      <p>{description}</p>
    </div>
  )
}
