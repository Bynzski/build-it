import type { MaterialId } from './materials'

export type AssemblyId = 'foundation' | 'floor' | 'walls' | 'roof'
export type MemberLayer = 'framing' | 'sheathing' | 'weather' | 'finish'
export type Vector3Tuple = [number, number, number]
export type ProfilePoint = [number, number]

export interface ProfileRegion {
  outline: ProfilePoint[]
  holes: ProfilePoint[][]
}

export interface CutInstruction {
  id: string
  label: string
  type: 'square' | 'plumb' | 'birdsmouth' | 'slope'
  angleDeg?: number
  depthIn?: number
  seatLengthIn?: number
  note?: string
}

export interface FabricationSpec {
  longPointLengthIn: number
  cuts: CutInstruction[]
}

export interface ConstructionMember {
  id: string
  label: string
  assembly: AssemblyId
  layer: MemberLayer
  materialId: MaterialId
  size: Vector3Tuple
  position: Vector3Tuple
  rotation?: Vector3Tuple
  cutLengthIn?: number
  shape?: 'box' | 'gable' | 'profile' | 'cut-panel'
  profile?: ProfilePoint[]
  profileRegions?: ProfileRegion[]
  profileExtrusionIn?: number
  fabrication?: FabricationSpec
}

export interface SurfaceQuantity {
  id: string
  label: string
  assembly: AssemblyId
  materialId: MaterialId
  areaSqIn: number
  sourceSheetCount?: number
}

export interface ShoppingListItem {
  id: string
  materialId: MaterialId
  label: string
  count: number
  unit: string
  purchaseLengthIn?: number
  note?: string
}

export interface ConstructionBreakdownItem {
  id: string
  assembly: AssemblyId
  materialId: MaterialId
  label: string
  count?: number
  areaSqIn?: number
}

export type GuidanceLevel = 'suggestion' | 'warning' | 'blocked'

export interface GuidanceItem {
  id: string
  level: GuidanceLevel
  title: string
  message: string
  field?: 'widthIn' | 'lengthIn' | 'wallHeightIn'
  suggestedValueIn?: number
}

export interface GeneratedBuilding {
  members: ConstructionMember[]
  surfaces: SurfaceQuantity[]
  shoppingList: ShoppingListItem[]
  breakdown: ConstructionBreakdownItem[]
  guidance: GuidanceItem[]
  metrics: {
    footprintSqFt: number
    wallAreaSqFt: number
    roofAreaSqFt: number
    peakHeightIn: number
    framingMemberCount: number
  }
}
