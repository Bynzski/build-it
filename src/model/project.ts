import { z } from 'zod'
import referenceDesignJson from '../../designs/8x10-shed.buildit.json'

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

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
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
})

export type BuildItProject = z.infer<typeof projectSchema>
export type Opening = z.infer<typeof openingSchema>
export type WallId = Opening['wall']

export const referenceDesign: BuildItProject = projectSchema.parse(referenceDesignJson)

export function parseProject(value: unknown): BuildItProject {
  return projectSchema.parse(value)
}

export function cloneProject(project: BuildItProject): BuildItProject {
  return structuredClone(project)
}
