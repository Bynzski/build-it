import { del, get, set } from 'idb-keyval'
import { type BuildItProject, parseProject } from '../model/project'

const RECOVERY_KEY = 'buildit:recovery:v1'

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<FileSystemFileHandle>
}

function projectJson(project: BuildItProject): string {
  return `${JSON.stringify(project, null, 2)}\n`
}

export function projectFileName(project: BuildItProject): string {
  const safeName = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${safeName || 'buildit-design'}.buildit.json`
}

export async function saveRecovery(project: BuildItProject): Promise<void> {
  await set(RECOVERY_KEY, project)
}

export async function loadRecovery(): Promise<BuildItProject | null> {
  const recovered = await get<unknown>(RECOVERY_KEY)
  if (!recovered) return null
  const parsed = parseProject(recovered)
  return parsed
}

export async function clearRecovery(): Promise<void> {
  await del(RECOVERY_KEY)
}

export async function readProjectFile(file: File): Promise<BuildItProject> {
  const value: unknown = JSON.parse(await file.text())
  return parseProject(value)
}

function downloadProject(project: BuildItProject): void {
  const blob = new Blob([projectJson(project)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = projectFileName(project)
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function saveProjectFile(project: BuildItProject): Promise<'file' | 'download'> {
  const pickerWindow = window as SaveFilePickerWindow
  if (!pickerWindow.showSaveFilePicker) {
    downloadProject(project)
    return 'download'
  }

  try {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName: projectFileName(project),
      types: [
        {
          description: 'BuildIt project',
          accept: { 'application/json': ['.json'] },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(projectJson(project))
    await writable.close()
    return 'file'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    downloadProject(project)
    return 'download'
  }
}
