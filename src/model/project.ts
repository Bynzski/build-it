import { z } from 'zod'
import referenceDesignJson from '../../designs/8x10-shed.buildit.json'
import type { SavedView } from './savedView'

const spacingSchema = z.union([z.literal(16), z.literal(24)])
const wallSizeSchema = z.enum(['2x4', '2x6'])
const framingSizeSchema = z.enum(['2x4', '2x6', '2x8'])

export const openingSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['door', 'window']),
  wall: z.enum(['front', 'back', 'left', 'right']),
  centerOffsetIn: z.number().finite(),
  widthIn: z.number().min(12).max(120),
  heightIn: z.number().min(12).max(120),
  sillHeightIn: z.number().min(0).max(120),
})

const displayStateSchema = z.enum(['visible', 'ghosted', 'hidden'])
const assemblyOverridesSchema = z
  .object({
    foundation: displayStateSchema.optional(),
    floor: displayStateSchema.optional(),
    walls: displayStateSchema.optional(),
    roof: displayStateSchema.optional(),
  })
  .default({})
const roleOverridesSchema = z
  .object({
    structure: displayStateSchema.optional(),
    sheathing: displayStateSchema.optional(),
    weatherproofing: displayStateSchema.optional(),
    'trim-flashing': displayStateSchema.optional(),
    insulation: displayStateSchema.optional(),
    'exterior-finish': displayStateSchema.optional(),
    'interior-finish': displayStateSchema.optional(),
    opening: displayStateSchema.optional(),
  })
  .default({})

export const savedViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  camera: z.object({
    position: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    target: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  }),
  visibility: z.object({
    preset: z.enum(['complete', 'framing', 'sheathing', 'weather', 'finished', 'xray']),
    assemblyOverrides: assemblyOverridesSchema,
    roleOverrides: roleOverridesSchema,
    scopeOverrides: z.record(z.string(), displayStateSchema).default({}),
    scopeRoleOverrides: z.record(z.string(), displayStateSchema).default({}),
    isolation: z
      .object({
        type: z.enum(['assembly', 'scope', 'scope-role', 'role']),
        id: z.string().min(1),
      })
      .nullable()
      .default(null),
  }),
  section: z.object({
    enabled: z.boolean(),
    direction: z.enum(['front', 'back', 'left', 'right', 'top']),
    offsetIn: z.number().min(0).max(600),
  }),
}) satisfies z.ZodType<SavedView>

const projectFields = {
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  useType: z.enum(['shed', 'cabin']),
  dimensions: z.object({
    widthIn: z.number().min(72).max(288),
    lengthIn: z.number().min(72).max(480),
    wallHeightIn: z.number().min(72).max(144),
  }),
  foundation: z.object({
    type: z.literal('skids'),
    skidSize: z.literal('4x6'),
    skidCount: z.number().int().min(2).max(6),
  }),
  floor: z.object({
    joistSize: framingSizeSchema,
    spacingIn: spacingSchema,
    sheathingMaterialId: z.literal('subfloor-23-32'),
  }),
  walls: z.object({
    studSize: wallSizeSchema,
    spacingIn: spacingSchema,
    sheathingMaterialId: z.literal('osb-7-16'),
    weatherBarrierMaterialId: z.literal('housewrap-wrb').default('housewrap-wrb'),
    sidingMaterialId: z.literal('t1-11-5-8'),
    insulationMaterialId: z.literal('fiberglass-r13').nullable(),
    interiorMaterialId: z.literal('drywall-1-2').nullable(),
  }),
  roof: z.object({
    type: z.literal('gable'),
    pitchRise: z.number().int().min(2).max(12),
    overhangIn: z.number().min(0).max(36),
    rafterSize: framingSizeSchema,
    spacingIn: spacingSchema,
    sheathingMaterialId: z.literal('osb-7-16'),
    roofingMaterialId: z.literal('metal-roofing'),
  }),
  openings: z.array(openingSchema).max(12),
  wasteFactorPct: z.number().min(0).max(30),
}

const projectV1Schema = z.object({
  schemaVersion: z.literal(1),
  ...projectFields,
})

export const projectSchema = z.object({
  schemaVersion: z.literal(2),
  ...projectFields,
  savedViews: z.array(savedViewSchema).max(24).default([]),
})

export type BuildItProject = z.infer<typeof projectSchema>
export type Opening = z.infer<typeof openingSchema>
export type WallId = Opening['wall']

export const referenceDesign: BuildItProject = projectSchema.parse(referenceDesignJson)

export function parseProject(value: unknown): BuildItProject {
  const version = z.object({ schemaVersion: z.number() }).parse(value).schemaVersion
  if (version === 1) {
    const legacy = projectV1Schema.parse(value)
    return projectSchema.parse({ ...legacy, schemaVersion: 2, savedViews: [] })
  }
  return projectSchema.parse(value)
}

export function cloneProject(project: BuildItProject): BuildItProject {
  return structuredClone(project)
}
