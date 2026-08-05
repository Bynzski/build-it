export type MaterialCategory = 'lumber' | 'panel' | 'coverage' | 'linear' | 'unit'

export interface PanelCladdingInstallation {
  layout: 'panel'
  thicknessIn: number
  panelWidthIn: number
  panelHeightIn: number
  verticalJointGapIn: number
  horizontalJoint: {
    treatment: 'z-flashing'
    clearanceAboveIn: number
  }
  openingClearanceIn: number
  openingHeadFlashing: 'z-flashing'
  requiresWeatherBarrier: boolean
}

export interface ExposedFastenerRoofingInstallation {
  layout: 'exposed-fastener-panel'
  gauge: number
  panelCoverageWidthIn: number
  majorRibSpacingIn: number
  majorRibHeightIn: number
  visualBaseThicknessIn: number
  visualRibWidthIn: number
  minimumPitchRise: number
  eavePanelOverhangIn: number
  trimWingIn: number
  maximumFastenerRowSpacingIn: number
  panelScrewsPerCoverageWidthPerRow: number
  fastenerPackQuantity: number
}

export interface MaterialDefinition {
  id: string
  name: string
  shortName: string
  category: MaterialCategory
  actualWidthIn?: number
  actualDepthIn?: number
  availableLengthsIn?: number[]
  coverageSqFt?: number
  wallCladding?: PanelCladdingInstallation
  roofCladding?: ExposedFastenerRoofingInstallation
  metallic?: boolean
  unit: string
  color: string
}

export const materialCatalog = {
  'pt-4x6': {
    id: 'pt-4x6',
    name: 'Pressure-treated 4×6',
    shortName: 'PT 4×6',
    category: 'lumber',
    actualWidthIn: 3.5,
    actualDepthIn: 5.5,
    availableLengthsIn: [96, 120, 144, 192],
    unit: 'board',
    color: '#786247',
  },
  '2x4': {
    id: '2x4',
    name: '2×4 dimensional lumber',
    shortName: '2×4',
    category: 'lumber',
    actualWidthIn: 1.5,
    actualDepthIn: 3.5,
    availableLengthsIn: [96, 120, 144, 168, 192],
    unit: 'board',
    color: '#d5ad72',
  },
  '2x6': {
    id: '2x6',
    name: '2×6 dimensional lumber',
    shortName: '2×6',
    category: 'lumber',
    actualWidthIn: 1.5,
    actualDepthIn: 5.5,
    availableLengthsIn: [96, 120, 144, 168, 192],
    unit: 'board',
    color: '#c99a5e',
  },
  '2x8': {
    id: '2x8',
    name: '2×8 dimensional lumber',
    shortName: '2×8',
    category: 'lumber',
    actualWidthIn: 1.5,
    actualDepthIn: 7.25,
    availableLengthsIn: [96, 120, 144, 168, 192],
    unit: 'board',
    color: '#bd8d52',
  },
  '2x10': {
    id: '2x10',
    name: '2×10 dimensional lumber',
    shortName: '2×10',
    category: 'lumber',
    actualWidthIn: 1.5,
    actualDepthIn: 9.25,
    availableLengthsIn: [96, 120, 144, 168, 192],
    unit: 'board',
    color: '#b2814a',
  },
  '2x12': {
    id: '2x12',
    name: '2×12 dimensional lumber',
    shortName: '2×12',
    category: 'lumber',
    actualWidthIn: 1.5,
    actualDepthIn: 11.25,
    availableLengthsIn: [96, 120, 144, 168, 192],
    unit: 'board',
    color: '#aa7944',
  },
  'exterior-1x4-trim': {
    id: 'exterior-1x4-trim',
    name: 'Exterior 1×4 corner trim',
    shortName: '1×4 corner trim',
    category: 'lumber',
    actualWidthIn: 0.75,
    actualDepthIn: 3.5,
    availableLengthsIn: [96, 120, 144, 192],
    unit: 'board',
    color: '#b88954',
  },
  'z-flashing': {
    id: 'z-flashing',
    name: 'Galvanized Z-flashing',
    shortName: 'Z-flashing',
    category: 'linear',
    availableLengthsIn: [120],
    unit: '10-foot piece',
    color: '#b8c1c2',
    metallic: true,
  },
  'ridge-strap': {
    id: 'ridge-strap',
    name: '1-1/4-inch 20-gauge ridge strap',
    shortName: 'Ridge strap',
    category: 'linear',
    availableLengthsIn: [36],
    unit: '36-inch strap',
    color: '#9eaaac',
    metallic: true,
  },
  'housewrap-wrb': {
    id: 'housewrap-wrb',
    name: 'Housewrap water-resistive barrier',
    shortName: 'Housewrap WRB',
    category: 'coverage',
    coverageSqFt: 900,
    unit: '9×100-foot roll',
    color: '#d9e4df',
  },
  'subfloor-23-32': {
    id: 'subfloor-23-32',
    name: '23/32-inch tongue-and-groove subfloor',
    shortName: '23/32″ subfloor',
    category: 'panel',
    coverageSqFt: 32,
    unit: '4×8 sheet',
    color: '#9a754d',
  },
  'osb-7-16': {
    id: 'osb-7-16',
    name: '7/16-inch OSB sheathing',
    shortName: '7/16″ OSB',
    category: 'panel',
    coverageSqFt: 32,
    unit: '4×8 sheet',
    color: '#b78d57',
  },
  't1-11-5-8': {
    id: 't1-11-5-8',
    name: '5/8-inch T1-11 siding',
    shortName: 'T1-11 siding',
    category: 'panel',
    coverageSqFt: 32,
    wallCladding: {
      layout: 'panel',
      thicknessIn: 5 / 8,
      panelWidthIn: 48,
      panelHeightIn: 96,
      verticalJointGapIn: 1 / 8,
      horizontalJoint: {
        treatment: 'z-flashing',
        clearanceAboveIn: 3 / 8,
      },
      openingClearanceIn: 3 / 16,
      openingHeadFlashing: 'z-flashing',
      requiresWeatherBarrier: true,
    },
    unit: '4×8 sheet',
    color: '#92704c',
  },
  'metal-roofing': {
    id: 'metal-roofing',
    name: '29-gauge 9–36 exposed-fastener roof panel',
    shortName: '9–36 roof panel',
    category: 'panel',
    roofCladding: {
      layout: 'exposed-fastener-panel',
      gauge: 29,
      panelCoverageWidthIn: 36,
      majorRibSpacingIn: 9,
      majorRibHeightIn: 3 / 4,
      visualBaseThicknessIn: 1 / 16,
      visualRibWidthIn: 3 / 4,
      minimumPitchRise: 3,
      eavePanelOverhangIn: 1,
      trimWingIn: 6,
      maximumFastenerRowSpacingIn: 36,
      panelScrewsPerCoverageWidthPerRow: 5,
      fastenerPackQuantity: 250,
    },
    unit: 'custom-cut panel',
    color: '#4f6670',
    metallic: true,
  },
  'synthetic-roof-underlayment': {
    id: 'synthetic-roof-underlayment',
    name: 'Metal-roof-compatible synthetic underlayment',
    shortName: 'Roof underlayment',
    category: 'coverage',
    coverageSqFt: 1000,
    unit: '10-square roll',
    color: '#7f8c8d',
  },
  'metal-eave-trim': {
    id: 'metal-eave-trim',
    name: 'Metal eave/drip trim',
    shortName: 'Eave trim',
    category: 'linear',
    availableLengthsIn: [120, 144, 168, 192],
    unit: 'trim piece',
    color: '#465e68',
    metallic: true,
  },
  'metal-rake-trim': {
    id: 'metal-rake-trim',
    name: 'Metal rake/gable trim',
    shortName: 'Rake trim',
    category: 'linear',
    availableLengthsIn: [120, 144, 168, 192],
    unit: 'trim piece',
    color: '#465e68',
    metallic: true,
  },
  'metal-ridge-cap': {
    id: 'metal-ridge-cap',
    name: 'Solid metal ridge cap',
    shortName: 'Ridge cap',
    category: 'linear',
    availableLengthsIn: [120, 144, 168, 192],
    unit: 'ridge-cap piece',
    color: '#405862',
    metallic: true,
  },
  'metal-eave-closure': {
    id: 'metal-eave-closure',
    name: 'Profiled metal-roof eave closure',
    shortName: 'Eave closure',
    category: 'linear',
    availableLengthsIn: [36, 72, 120, 144],
    unit: 'closure strip',
    color: '#343e3f',
  },
  'metal-ridge-closure': {
    id: 'metal-ridge-closure',
    name: 'Profiled solid ridge closure',
    shortName: 'Ridge closure',
    category: 'linear',
    availableLengthsIn: [36, 72, 120, 144],
    unit: 'closure strip',
    color: '#343e3f',
  },
  'metal-roof-fasteners': {
    id: 'metal-roof-fasteners',
    name: 'Color-matched metal roofing screws with sealing washers',
    shortName: 'Roofing screws',
    category: 'unit',
    unit: '250-count box',
    color: '#596c72',
    metallic: true,
  },
  'fiberglass-r13': {
    id: 'fiberglass-r13',
    name: 'R-13 fiberglass batt insulation',
    shortName: 'R-13 batts',
    category: 'coverage',
    coverageSqFt: 40,
    unit: 'bundle',
    color: '#d5aa9e',
  },
  'drywall-1-2': {
    id: 'drywall-1-2',
    name: '1/2-inch drywall',
    shortName: '1/2″ drywall',
    category: 'panel',
    coverageSqFt: 32,
    unit: '4×8 sheet',
    color: '#ddd8c9',
  },
} as const satisfies Record<string, MaterialDefinition>

export type MaterialId = keyof typeof materialCatalog

export function getMaterial(id: MaterialId): MaterialDefinition {
  return materialCatalog[id]
}

export function getPanelCladdingInstallation(id: MaterialId): PanelCladdingInstallation {
  const installation = getMaterial(id).wallCladding
  if (!installation) throw new Error(`Material ${id} is not configured as panel wall cladding`)
  return installation
}

export function getRoofCladdingInstallation(id: MaterialId): ExposedFastenerRoofingInstallation {
  const installation = getMaterial(id).roofCladding
  if (!installation) throw new Error(`Material ${id} is not configured as roof cladding`)
  return installation
}
