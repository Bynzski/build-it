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
  panelFastenersPerSquare: number
  sideLapFastenerSpacingIn: number
  trimFastenerSpacingIn: number
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
  packageQuantity?: number
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
      panelFastenersPerSquare: 80,
      sideLapFastenerSpacingIn: 12,
      trimFastenerSpacingIn: 12,
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
  '16d-framing-nails': {
    id: '16d-framing-nails',
    name: '16d framing nails',
    shortName: '16d framing nails',
    category: 'unit',
    packageQuantity: 250,
    unit: 'approximately 250-count box',
    color: '#697476',
    metallic: true,
  },
  '10d-common-nails': {
    id: '10d-common-nails',
    name: '10d common framing nails',
    shortName: '10d common nails',
    category: 'unit',
    packageQuantity: 250,
    unit: 'approximately 250-count box',
    color: '#707b7d',
    metallic: true,
  },
  '8d-common-nails': {
    id: '8d-common-nails',
    name: '8d common sheathing and framing nails',
    shortName: '8d common nails',
    category: 'unit',
    packageQuantity: 500,
    unit: 'approximately 500-count box',
    color: '#778184',
    metallic: true,
  },
  '8d-subfloor-nails': {
    id: '8d-subfloor-nails',
    name: '8d ring-shank subfloor nails',
    shortName: 'Subfloor nails',
    category: 'unit',
    packageQuantity: 500,
    unit: 'approximately 500-count box',
    color: '#7b8587',
    metallic: true,
  },
  'siding-panel-nails': {
    id: 'siding-panel-nails',
    name: 'Hot-dip-galvanized ring-shank siding nails',
    shortName: 'Siding nails',
    category: 'unit',
    packageQuantity: 500,
    unit: 'approximately 500-count box',
    color: '#899395',
    metallic: true,
  },
  'exterior-trim-nails': {
    id: 'exterior-trim-nails',
    name: 'Hot-dip-galvanized exterior trim nails',
    shortName: 'Exterior trim nails',
    category: 'unit',
    packageQuantity: 250,
    unit: 'approximately 250-count box',
    color: '#8f999b',
    metallic: true,
  },
  'cap-fasteners': {
    id: 'cap-fasteners',
    name: 'Plastic-cap WRB and underlayment fasteners',
    shortName: 'Cap fasteners',
    category: 'unit',
    packageQuantity: 500,
    unit: '500-count box',
    color: '#a6aa9c',
  },
  'metal-panel-screws': {
    id: 'metal-panel-screws',
    name: '#10 metal-roof panel screws with sealing washers',
    shortName: 'Roof panel screws',
    category: 'unit',
    packageQuantity: 250,
    unit: '250-count box',
    color: '#596c72',
    metallic: true,
  },
  'metal-stitch-screws': {
    id: 'metal-stitch-screws',
    name: 'Color-matched metal-roof stitch screws',
    shortName: 'Stitch screws',
    category: 'unit',
    packageQuantity: 100,
    unit: '100-count box',
    color: '#53676d',
    metallic: true,
  },
  'metal-trim-screws': {
    id: 'metal-trim-screws',
    name: 'Low-profile metal roofing trim screws',
    shortName: 'Metal trim screws',
    category: 'unit',
    packageQuantity: 100,
    unit: '100-count box',
    color: '#62747a',
    metallic: true,
  },
  'drywall-screws-1-1-4': {
    id: 'drywall-screws-1-1-4',
    name: '1-1/4-inch coarse-thread drywall screws',
    shortName: 'Drywall screws',
    category: 'unit',
    packageQuantity: 230,
    unit: '1-pound box (approximately 230 screws)',
    color: '#3e4547',
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
