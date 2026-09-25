export interface WidgetProps {
  label: 'initial-label'
}

export function Widget({ label }: WidgetProps) {
  return <span className="widget">{label}</span>
}

export const widgetVersion = 42 as const

export default Widget
