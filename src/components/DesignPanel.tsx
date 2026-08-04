import type { Opening, WallId } from '../model/project'
import { useBuildStore } from '../store/useBuildStore'
import { FieldGroup, NumberField, SelectField, ToggleField } from './Fields'

const wallOptions: Array<{ value: WallId; label: string }> = [
  { value: 'front', label: 'Front wall' },
  { value: 'back', label: 'Back wall' },
  { value: 'left', label: 'Left wall' },
  { value: 'right', label: 'Right wall' },
]

function OpeningEditor({ opening }: { opening: Opening }) {
  const project = useBuildStore((state) => state.project)
  const updateOpening = useBuildStore((state) => state.updateOpening)
  const removeOpening = useBuildStore((state) => state.removeOpening)
  const selectedOpeningId = useBuildStore((state) => state.selectedOpeningId)
  const selectOpening = useBuildStore((state) => state.selectOpening)
  const selected = opening.id === selectedOpeningId
  const span =
    opening.wall === 'front' || opening.wall === 'back'
      ? project.dimensions.widthIn
      : project.dimensions.lengthIn

  return (
    <article className={`opening-card ${selected ? 'is-selected' : ''}`}>
      <button
        className="opening-card-heading"
        type="button"
        onClick={() => selectOpening(opening.id)}
      >
        <span className="opening-icon">{opening.type === 'door' ? '▯' : '⊞'}</span>
        <span>
          <strong>{opening.type === 'door' ? 'Door' : 'Window'}</strong>
          <small>{wallOptions.find((wall) => wall.value === opening.wall)?.label}</small>
        </span>
        <span className="opening-chevron">{selected ? '−' : '+'}</span>
      </button>
      {selected ? (
        <div className="opening-card-body">
          <SelectField
            label="Wall"
            value={opening.wall}
            options={wallOptions}
            onChange={(wall) => updateOpening(opening.id, { wall, centerOffsetIn: 0 })}
          />
          <NumberField
            label="Center offset"
            value={opening.centerOffsetIn}
            min={-span / 2}
            max={span / 2}
            onChange={(centerOffsetIn) => updateOpening(opening.id, { centerOffsetIn })}
            dimension
          />
          <NumberField
            label="Width"
            value={opening.widthIn}
            min={12}
            max={Math.min(120, span)}
            onChange={(widthIn) => updateOpening(opening.id, { widthIn })}
            dimension
          />
          <NumberField
            label="Height"
            value={opening.heightIn}
            min={12}
            max={120}
            onChange={(heightIn) => updateOpening(opening.id, { heightIn })}
            dimension
          />
          {opening.type === 'window' ? (
            <NumberField
              label="Sill height"
              value={opening.sillHeightIn}
              min={12}
              max={84}
              onChange={(sillHeightIn) => updateOpening(opening.id, { sillHeightIn })}
              dimension
            />
          ) : null}
          <button className="danger-button" type="button" onClick={() => removeOpening(opening.id)}>
            Remove {opening.type}
          </button>
        </div>
      ) : null}
    </article>
  )
}

export function DesignPanel() {
  const project = useBuildStore((state) => state.project)
  const setName = useBuildStore((state) => state.setName)
  const setDimension = useBuildStore((state) => state.setDimension)
  const setWallOptions = useBuildStore((state) => state.setWallOptions)
  const setFloorOptions = useBuildStore((state) => state.setFloorOptions)
  const setRoofOptions = useBuildStore((state) => state.setRoofOptions)
  const setFoundationOptions = useBuildStore((state) => state.setFoundationOptions)
  const setWasteFactor = useBuildStore((state) => state.setWasteFactor)
  const addOpening = useBuildStore((state) => state.addOpening)

  return (
    <div className="panel-scroll design-panel" data-testid="design-panel">
      <div className="project-name-field">
        <label htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          value={project.name}
          maxLength={120}
          onChange={(event) => {
            if (event.currentTarget.value.trim()) setName(event.currentTarget.value)
          }}
        />
      </div>

      <FieldGroup title="Dimensions" description="Drag the colored handles or enter exact values.">
        <NumberField
          label="Width"
          value={project.dimensions.widthIn}
          min={72}
          max={288}
          onChange={(value) => setDimension('widthIn', value)}
          dimension
        />
        <NumberField
          label="Length"
          value={project.dimensions.lengthIn}
          min={72}
          max={480}
          onChange={(value) => setDimension('lengthIn', value)}
          dimension
        />
        <NumberField
          label="Wall height"
          value={project.dimensions.wallHeightIn}
          min={72}
          max={144}
          onChange={(value) => setDimension('wallHeightIn', value)}
          dimension
        />
      </FieldGroup>

      <FieldGroup title="Foundation & floor">
        <NumberField
          label="Skid count"
          value={project.foundation.skidCount}
          min={2}
          max={6}
          onChange={(skidCount) => setFoundationOptions({ skidCount })}
        />
        <SelectField
          label="Floor joists"
          value={project.floor.joistSize}
          options={[
            { value: '2x4', label: '2×4' },
            { value: '2x6', label: '2×6' },
            { value: '2x8', label: '2×8' },
          ]}
          onChange={(joistSize) => setFloorOptions({ joistSize })}
        />
        <SelectField
          label="Joist spacing"
          value={project.floor.spacingIn}
          options={[
            { value: 16, label: '16″ on center' },
            { value: 24, label: '24″ on center' },
          ]}
          onChange={(spacingIn) => setFloorOptions({ spacingIn })}
        />
      </FieldGroup>

      <FieldGroup title="Walls">
        <SelectField
          label="Stud size"
          value={project.walls.studSize}
          options={[
            { value: '2x4', label: '2×4' },
            { value: '2x6', label: '2×6' },
          ]}
          onChange={(studSize) => setWallOptions({ studSize })}
        />
        <SelectField
          label="Stud spacing"
          value={project.walls.spacingIn}
          options={[
            { value: 16, label: '16″ on center' },
            { value: 24, label: '24″ on center' },
          ]}
          onChange={(spacingIn) => setWallOptions({ spacingIn })}
        />
        <ToggleField
          label="Insulation"
          description="R-13 fiberglass batts"
          checked={project.walls.insulationMaterialId !== null}
          onChange={(checked) =>
            setWallOptions({ insulationMaterialId: checked ? 'fiberglass-r13' : null })
          }
        />
        <ToggleField
          label="Interior finish"
          description="1/2-inch drywall"
          checked={project.walls.interiorMaterialId !== null}
          onChange={(checked) =>
            setWallOptions({ interiorMaterialId: checked ? 'drywall-1-2' : null })
          }
        />
      </FieldGroup>

      <FieldGroup title="Gable roof">
        <SelectField
          label="Rafter size"
          value={project.roof.rafterSize}
          options={[
            { value: '2x4', label: '2×4' },
            { value: '2x6', label: '2×6' },
            { value: '2x8', label: '2×8' },
          ]}
          onChange={(rafterSize) => setRoofOptions({ rafterSize })}
        />
        <SelectField
          label="Rafter spacing"
          value={project.roof.spacingIn}
          options={[
            { value: 16, label: '16″ on center' },
            { value: 24, label: '24″ on center' },
          ]}
          onChange={(spacingIn) => setRoofOptions({ spacingIn })}
        />
        <NumberField
          label="Roof pitch"
          value={project.roof.pitchRise}
          min={2}
          max={12}
          onChange={(pitchRise) => setRoofOptions({ pitchRise })}
          suffix=":12"
        />
        <NumberField
          label="Overhang"
          value={project.roof.overhangIn}
          min={0}
          max={36}
          onChange={(overhangIn) => setRoofOptions({ overhangIn })}
          dimension
        />
      </FieldGroup>

      <FieldGroup title="Doors & windows" description="Select an opening to edit its placement.">
        <div className="opening-actions">
          <button type="button" onClick={() => addOpening('door')}>
            + Door
          </button>
          <button type="button" onClick={() => addOpening('window')}>
            + Window
          </button>
        </div>
        <div className="opening-list">
          {project.openings.map((opening) => (
            <OpeningEditor key={opening.id} opening={opening} />
          ))}
        </div>
      </FieldGroup>

      <FieldGroup title="Estimate settings">
        <NumberField
          label="Waste factor"
          value={project.wasteFactorPct}
          min={0}
          max={30}
          onChange={setWasteFactor}
          suffix="%"
        />
      </FieldGroup>
    </div>
  )
}
