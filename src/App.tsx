import { useEffect, useMemo, useRef, useState } from 'react'
import { ZodError } from 'zod'
import { DesignPanel } from './components/DesignPanel'
import { GuidancePanel } from './components/GuidancePanel'
import { MaterialsPanel } from './components/MaterialsPanel'
import { generateBuilding } from './domain/generateBuilding'
import { getMaterial } from './domain/materials'
import { formatFeetInches } from './domain/units'
import {
  clearRecovery,
  loadRecovery,
  readProjectFile,
  saveProjectFile,
  saveRecovery,
} from './persistence/projects'
import { BuildingScene } from './scene/BuildingScene'
import { useBuildStore, type ViewMode } from './store/useBuildStore'

type PanelTab = 'design' | 'materials' | 'guidance'

const viewModes: Array<{ value: ViewMode; label: string }> = [
  { value: 'framing', label: 'Framing' },
  { value: 'both', label: 'Both' },
  { value: 'envelope', label: 'Envelope' },
]

export default function App() {
  const project = useBuildStore((state) => state.project)
  const past = useBuildStore((state) => state.past)
  const future = useBuildStore((state) => state.future)
  const undo = useBuildStore((state) => state.undo)
  const redo = useBuildStore((state) => state.redo)
  const reset = useBuildStore((state) => state.reset)
  const replaceProject = useBuildStore((state) => state.replaceProject)
  const viewMode = useBuildStore((state) => state.viewMode)
  const setViewMode = useBuildStore((state) => state.setViewMode)
  const layerVisibility = useBuildStore((state) => state.layerVisibility)
  const toggleLayer = useBuildStore((state) => state.toggleLayer)
  const selectedMemberId = useBuildStore((state) => state.selectedMemberId)
  const selectedOpeningId = useBuildStore((state) => state.selectedOpeningId)
  const selectMember = useBuildStore((state) => state.selectMember)
  const selectOpening = useBuildStore((state) => state.selectOpening)
  const [activeTab, setActiveTab] = useState<PanelTab>('design')
  const [status, setStatus] = useState<string>('Reference design loaded')
  const [hydrated, setHydrated] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const building = useMemo(() => generateBuilding(project), [project])
  const selectedMember = building.members.find((member) => member.id === selectedMemberId)
  const selectedOpening = project.openings.find((opening) => opening.id === selectedOpeningId)
  const blockedCount = building.guidance.filter((item) => item.level === 'blocked').length

  useEffect(() => {
    let active = true
    loadRecovery()
      .then((recovered) => {
        if (!active || !recovered) return
        replaceProject(recovered)
        setStatus('Recovered local autosave')
      })
      .catch(() => setStatus('Reference design loaded'))
      .finally(() => {
        if (active) setHydrated(true)
      })
    return () => {
      active = false
    }
  }, [replaceProject])

  useEffect(() => {
    if (!hydrated) return
    const timeout = window.setTimeout(() => {
      saveRecovery(project).catch(() => setStatus('Autosave unavailable'))
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [hydrated, project])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
      if (event.key === 'Escape') {
        selectMember(null)
        selectOpening(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [redo, selectMember, selectOpening, undo])

  const handleSave = async () => {
    try {
      const result = await saveProjectFile(project)
      setStatus(result === 'file' ? 'Project saved' : 'Project downloaded')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setStatus('Could not save project')
      }
    }
  }

  const handleOpen = async (file: File | undefined) => {
    if (!file) return
    try {
      const opened = await readProjectFile(file)
      replaceProject(opened)
      setStatus(`Opened ${file.name}`)
    } catch (error) {
      setStatus(
        error instanceof ZodError
          ? 'Project file does not match the BuildIt v1 schema'
          : 'Could not read project file',
      )
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Reset this design to the committed 8×10 reference shed?')) return
    reset()
    await clearRecovery()
    setStatus('Reference design restored')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </div>
          <div>
            <h1>BuildIt</h1>
            <p>Material-aware building designer</p>
          </div>
        </div>

        <div className="header-center">
          <span className={`save-status ${blockedCount ? 'has-blocked' : ''}`}>
            <span />
            {blockedCount ? `${blockedCount} blocked item${blockedCount > 1 ? 's' : ''}` : status}
          </span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            onClick={undo}
            disabled={!past.length}
            title="Undo"
          >
            ↶
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={redo}
            disabled={!future.length}
            title="Redo"
          >
            ↷
          </button>
          <span className="header-divider" />
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".json,.buildit.json,application/json"
            onChange={(event) => {
              void handleOpen(event.currentTarget.files?.[0])
              event.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
          >
            Open
          </button>
          <button type="button" className="primary-button" onClick={() => void handleSave()}>
            Save project
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="viewport-section" aria-label="3D building workspace">
          <div className="viewport-toolbar">
            <fieldset className="segmented-control">
              <legend className="visually-hidden">Model view</legend>
              {viewModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={viewMode === mode.value ? 'is-active' : ''}
                  onClick={() => setViewMode(mode.value)}
                >
                  {mode.label}
                </button>
              ))}
            </fieldset>
            <div className="layer-control">
              {(['foundation', 'floor', 'walls', 'roof'] as const).map((layer) => (
                <button
                  key={layer}
                  type="button"
                  className={layerVisibility[layer] ? 'is-active' : ''}
                  onClick={() => toggleLayer(layer)}
                >
                  <span />
                  {layer}
                </button>
              ))}
            </div>
            <button type="button" className="reset-button" onClick={() => void handleReset()}>
              Reset reference
            </button>
          </div>

          <div className="viewport-canvas" data-testid="building-viewport">
            <BuildingScene building={building} />
          </div>

          <div className="dimension-readout">
            <span style={{ '--accent': '#e56b38' } as React.CSSProperties}>
              W {formatFeetInches(project.dimensions.widthIn)}
            </span>
            <span style={{ '--accent': '#2e7d74' } as React.CSSProperties}>
              L {formatFeetInches(project.dimensions.lengthIn)}
            </span>
            <span style={{ '--accent': '#3d64a3' } as React.CSSProperties}>
              H {formatFeetInches(project.dimensions.wallHeightIn)}
            </span>
          </div>

          <div className="viewport-help">
            <span>Click + drag colored handles</span>
            <span>Shift for fine ¼″ control · Esc cancels</span>
            <span>Orbit · right-drag pan · scroll zoom</span>
          </div>

          {selectedMember ? (
            <aside className="selection-card">
              <button type="button" onClick={() => selectMember(null)} aria-label="Close selection">
                ×
              </button>
              <span className="eyebrow">Selected member</span>
              <h3>{selectedMember.label}</h3>
              <dl>
                <div>
                  <dt>Material</dt>
                  <dd>{getMaterial(selectedMember.materialId).shortName}</dd>
                </div>
                <div>
                  <dt>Assembly</dt>
                  <dd>{selectedMember.assembly}</dd>
                </div>
                {selectedMember.cutLengthIn ? (
                  <div>
                    <dt>Cut length</dt>
                    <dd>{formatFeetInches(selectedMember.cutLengthIn)}</dd>
                  </div>
                ) : null}
              </dl>
              {selectedMember.fabrication ? (
                <div className="fabrication-details">
                  <h4>Cut details</h4>
                  <ul>
                    {selectedMember.fabrication.cuts.map((cut) => (
                      <li key={cut.id}>
                        <strong className="fabrication-name">{cut.label}</strong>
                        <span className="fabrication-value">
                          {cut.angleDeg !== undefined ? `${cut.angleDeg.toFixed(1)}°` : null}
                          {cut.seatLengthIn !== undefined
                            ? `${cut.angleDeg !== undefined ? ' · ' : ''}${formatFeetInches(cut.seatLengthIn)} seat`
                            : null}
                          {cut.depthIn !== undefined
                            ? `${cut.angleDeg !== undefined || cut.seatLengthIn !== undefined ? ' · ' : ''}${formatFeetInches(cut.depthIn)} depth`
                            : null}
                        </span>
                        {cut.note ? <small className="fabrication-note">{cut.note}</small> : null}
                      </li>
                    ))}
                  </ul>
                  <p>Conceptual cut intent; verify dimensions on the built assembly.</p>
                </div>
              ) : null}
            </aside>
          ) : null}

          {selectedOpening ? (
            <aside className="selection-card">
              <button
                type="button"
                onClick={() => selectOpening(null)}
                aria-label="Close selection"
              >
                ×
              </button>
              <span className="eyebrow">Selected opening</span>
              <h3>{selectedOpening.type === 'door' ? 'Door' : 'Window'}</h3>
              <p>
                {selectedOpening.wall} wall · {formatFeetInches(selectedOpening.widthIn)} ×{' '}
                {formatFeetInches(selectedOpening.heightIn)}
              </p>
              <button type="button" className="text-button" onClick={() => setActiveTab('design')}>
                Edit opening
              </button>
            </aside>
          ) : null}
        </section>

        <aside className="property-sidebar">
          <nav className="panel-tabs" aria-label="BuildIt panels">
            {(
              [
                ['design', 'Design'],
                ['materials', 'Materials'],
                ['guidance', 'Guidance'],
              ] as Array<[PanelTab, string]>
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={activeTab === value ? 'is-active' : ''}
                onClick={() => setActiveTab(value)}
              >
                {label}
                {value === 'guidance' && blockedCount ? <span>{blockedCount}</span> : null}
              </button>
            ))}
          </nav>
          {activeTab === 'design' ? <DesignPanel /> : null}
          {activeTab === 'materials' ? <MaterialsPanel building={building} /> : null}
          {activeTab === 'guidance' ? <GuidancePanel building={building} /> : null}
        </aside>
      </main>
    </div>
  )
}
