import dynamic from 'next/dynamic'

// Multiple dynamic components that themselves have nested dynamic imports
const FeatureCard = dynamic(() => import('../components/FeatureCard'))
const UserProfile = dynamic(() => import('../components/UserProfile'))

export default function Page() {
  return (
    <div>
      <h1>Nested Dynamic Components Test</h1>
      <div className="dynamic-component">
        <FeatureCard
          title="Feature 1"
          description="Description for feature 1"
        />
      </div>
      <div className="dynamic-component">
        <UserProfile name="Test User" count={42} />
      </div>
    </div>
  )
}
