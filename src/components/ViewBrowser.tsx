import { useMemo, useState } from 'react'
import type { GeneratedBuilding } from '../domain/construction'
import { formatFeetInches } from '../domain/units'
import type { CameraViewState, SavedView, SectionDirection } from '../model/savedView'
import {
  cameraViewForBuilding,
  type StandardCameraDirection,
  sectionDepthLimit,
} from '../scene/cameraViews'
import { useBuildStore } from '../store/useBuildStore'

interface ViewBrowserProps {
  building: GeneratedBuilding
  cameraView: CameraViewState
  onApplyCamera: (view: CameraViewState) => void
  onClose: () => void
}

const cameraDirections: Array<{ id: StandardCameraDirection; label: string }> = [
  { id: 'perspective', label: '3D' },
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
]

const sectionDirections: Array<{ id: SectionDirection; label: string }> = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
]

function nextSavedViewId(): string {
  return `view-${Date.now().toString(36)}`
}

export function ViewBrowser({ building, cameraView, onApplyCamera, onClose }: ViewBrowserProps) {
  const project = useBuildStore((state) => state.project)
  const sectionView = useBuildStore((state) => state.sectionView)
  const setSectionView = useBuildStore((state) => state.setSectionView)
  const captureVisibility = useBuildStore((state) => state.captureVisibility)
  const applySavedViewState = useBuildStore((state) => state.applySavedViewState)
  const upsertSavedView = useBuildStore((state) => state.upsertSavedView)
  const removeSavedView = useBuildStore((state) => state.removeSavedView)
  const [name, setName] = useState('')
  const depthLimit = sectionDepthLimit(
    sectionView,
    project.dimensions.widthIn,
    project.dimensions.lengthIn,
    building.metrics.peakHeightIn,
  )
  const cutDepth = Math.min(depthLimit, sectionView.offsetIn)

  const standardViews = useMemo(
    () =>
      Object.fromEntries(
        cameraDirections.map(({ id }) => [
          id,
          cameraViewForBuilding(
            id,
            project.dimensions.widthIn,
            project.dimensions.lengthIn,
            building.metrics.peakHeightIn,
            project.roof.overhangIn,
          ),
        ]),
      ) as Record<StandardCameraDirection, CameraViewState>,
    [building.metrics.peakHeightIn, project.dimensions, project.roof.overhangIn],
  )

  const captureView = (id: string, viewName: string): SavedView => ({
    id,
    name: viewName,
    camera: cameraView,
    visibility: captureVisibility(),
    section: { ...sectionView, offsetIn: cutDepth },
  })

  const saveNewView = () => {
    const trimmedName = name.trim()
    if (!trimmedName || project.savedViews.length >= 24) return
    upsertSavedView(captureView(nextSavedViewId(), trimmedName))
    setName('')
  }

  return (
    <aside className="view-browser" aria-label="Views and section cuts">
      <header className="layer-browser-header">
        <div>
          <span className="eyebrow">Workspace</span>
          <h2>Views</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close views">
          ×
        </button>
      </header>

      <div className="view-browser-scroll">
        <section className="view-browser-section">
          <h3>Standard views</h3>
          <div className="standard-view-grid">
            {cameraDirections.map((direction) => (
              <button
                key={direction.id}
                type="button"
                onClick={() => onApplyCamera(standardViews[direction.id])}
              >
                {direction.label}
              </button>
            ))}
          </div>
          <p>Axis-aligned views keep perspective enabled so orbiting can continue immediately.</p>
        </section>

        <section className="view-browser-section">
          <div className="section-heading-row">
            <div>
              <h3>Section cut</h3>
              <p>Temporarily remove the near side to inspect assemblies.</p>
            </div>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={sectionView.enabled}
                onChange={(event) => setSectionView({ enabled: event.target.checked })}
              />
              <span>{sectionView.enabled ? 'On' : 'Off'}</span>
            </label>
          </div>
          <div className="section-direction-grid">
            {sectionDirections.map((direction) => (
              <button
                key={direction.id}
                type="button"
                className={sectionView.direction === direction.id ? 'is-active' : ''}
                onClick={() =>
                  setSectionView({ enabled: true, direction: direction.id, offsetIn: 0 })
                }
              >
                {direction.label}
              </button>
            ))}
          </div>
          <div className="section-depth-control">
            <label htmlFor="section-depth">
              <span>Cut depth</span>
              <strong>{formatFeetInches(cutDepth)}</strong>
            </label>
            <input
              id="section-depth"
              type="range"
              min={0}
              max={depthLimit}
              step={0.25}
              value={cutDepth}
              disabled={!sectionView.enabled}
              onChange={(event) => setSectionView({ offsetIn: Number(event.target.value) })}
            />
          </div>
        </section>

        <section className="view-browser-section">
          <h3>Named views</h3>
          <p>Camera, semantic layers, and the section cut are stored in the project file.</p>
          <div className="save-view-row">
            <input
              type="text"
              value={name}
              maxLength={80}
              placeholder="View name"
              aria-label="New view name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveNewView()
              }}
            />
            <button
              type="button"
              disabled={!name.trim() || project.savedViews.length >= 24}
              onClick={saveNewView}
            >
              Save
            </button>
          </div>
          {project.savedViews.length >= 24 ? <p>Named-view limit reached (24).</p> : null}
          <div className="saved-view-list">
            {project.savedViews.length ? (
              project.savedViews.map((view) => (
                <article key={view.id}>
                  <div>
                    <strong>{view.name}</strong>
                    <small>
                      {view.visibility.preset}
                      {view.section.enabled ? ` · ${view.section.direction} cut` : ''}
                    </small>
                  </div>
                  <div className="saved-view-actions">
                    <button
                      type="button"
                      onClick={() => {
                        applySavedViewState(view)
                        onApplyCamera(view.camera)
                      }}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      title="Replace with the current camera, layers, and section"
                      onClick={() => upsertSavedView(captureView(view.id, view.name))}
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => removeSavedView(view.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-view-state">No named views yet.</div>
            )}
          </div>
        </section>
      </div>
      <footer>
        Named views avoid generated part IDs so they remain portable as the model rebuilds.
      </footer>
    </aside>
  )
}
