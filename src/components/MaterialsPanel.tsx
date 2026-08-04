import type { GeneratedBuilding } from '../domain/construction'
import { getMaterial } from '../domain/materials'
import { formatFeetInches, formatSquareFeet } from '../domain/units'
import { useBuildStore } from '../store/useBuildStore'

export function MaterialsPanel({ building }: { building: GeneratedBuilding }) {
  const project = useBuildStore((state) => state.project)

  return (
    <div className="panel-scroll materials-panel" data-testid="materials-panel">
      <div className="estimate-summary">
        <div>
          <strong>{building.metrics.framingMemberCount}</strong>
          <span>framing pieces</span>
        </div>
        <div>
          <strong>{Math.round(building.metrics.footprintSqFt)}</strong>
          <span>sq ft footprint</span>
        </div>
        <div>
          <strong>{Math.round(building.metrics.roofAreaSqFt)}</strong>
          <span>sq ft roof</span>
        </div>
      </div>

      <section className="material-section">
        <div className="material-section-heading">
          <div>
            <h3>Purchase estimate</h3>
            <p>Includes {project.wasteFactorPct}% waste on coverage materials.</p>
          </div>
        </div>
        <div className="shopping-list">
          {building.shoppingList.map((item) => {
            const material = getMaterial(item.materialId)
            return (
              <article className="shopping-item" key={item.id}>
                <span className="material-swatch" style={{ backgroundColor: material.color }} />
                <div>
                  <strong>{item.label}</strong>
                  <small>
                    {item.purchaseLengthIn ? `${formatFeetInches(item.purchaseLengthIn)} · ` : ''}
                    {item.note}
                  </small>
                </div>
                <span className="shopping-count">
                  <strong>{item.count}</strong>
                  <small>{item.unit}</small>
                </span>
              </article>
            )
          })}
        </div>
      </section>

      <section className="material-section">
        <div className="material-section-heading">
          <div>
            <h3>Construction breakdown</h3>
            <p>Generated directly from the current assemblies.</p>
          </div>
        </div>
        <div className="breakdown-list">
          {building.breakdown.map((item) => (
            <div className="breakdown-row" key={item.id}>
              <span>
                <small>{item.assembly}</small>
                {item.label}
              </span>
              <strong>
                {item.count !== undefined
                  ? `${item.count} pcs`
                  : formatSquareFeet(item.areaSqIn ?? 0)}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <div className="estimate-disclaimer">
        Planning estimate only. Confirm quantities, waste, spans, connections, and local
        requirements before purchasing or building.
      </div>
    </div>
  )
}
