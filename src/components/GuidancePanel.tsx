import type { GeneratedBuilding, GuidanceLevel } from '../domain/construction'
import { formatFeetInches } from '../domain/units'
import { useBuildStore } from '../store/useBuildStore'

const levelLabels: Record<GuidanceLevel, string> = {
  suggestion: 'Suggestion',
  warning: 'Review',
  blocked: 'Blocked',
}

export function GuidancePanel({ building }: { building: GeneratedBuilding }) {
  const setDimension = useBuildStore((state) => state.setDimension)

  return (
    <div className="panel-scroll guidance-panel" data-testid="guidance-panel">
      <div className="guidance-intro">
        <span className="eyebrow">Design helper</span>
        <h2>Material-aware guidance</h2>
        <p>
          BuildIt explains notable consequences without silently changing your design. Suggestions
          are optional; blocked items identify invalid internal geometry.
        </p>
      </div>
      <div className="guidance-list">
        {building.guidance.map((item) => (
          <article className={`guidance-card level-${item.level}`} key={item.id}>
            <div className="guidance-card-topline">
              <span>{levelLabels[item.level]}</span>
              <span className="guidance-dot" />
            </div>
            <h3>{item.title}</h3>
            <p>{item.message}</p>
            {item.field && item.suggestedValueIn !== undefined ? (
              <button
                type="button"
                onClick={() => {
                  if (item.field && item.suggestedValueIn !== undefined) {
                    setDimension(item.field, item.suggestedValueIn)
                  }
                }}
              >
                Apply {formatFeetInches(item.suggestedValueIn)}
              </button>
            ) : null}
          </article>
        ))}
      </div>
      <div className="product-boundary-card">
        <strong>Conceptual planning boundary</strong>
        <p>
          Guidance is not structural engineering, span approval, code verification, or permission to
          build.
        </p>
      </div>
    </div>
  )
}
