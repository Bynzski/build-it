import type {
  ConstructionBreakdownItem,
  ConstructionMember,
  ConsumableQuantity,
  ShoppingListItem,
  SurfaceQuantity,
} from './construction'
import { getMaterial, type MaterialId } from './materials'
import { squareInchesToSquareFeet } from './units'

interface EstimateResult {
  shoppingList: ShoppingListItem[]
  breakdown: ConstructionBreakdownItem[]
}

interface CutGroup {
  materialId: MaterialId
  stockLengthIn: number
  cutsIn: number[]
  note?: string
}

interface SurfacePurchaseGroup {
  coverageAreaSqIn: number
  sourceSheetCount: number
}

interface ConsumablePurchaseGroup {
  adjustedRequiredCount: number
  notes: Set<string>
}

function packedStockCount(cutsIn: number[], stockLengthIn: number): number {
  const sawKerfIn = 1 / 8
  const remainingByBoard: number[] = []

  for (const cut of [...cutsIn].sort((a, b) => b - a)) {
    const boardIndex = remainingByBoard.findIndex((remaining) => remaining >= cut + sawKerfIn)
    if (boardIndex === -1) remainingByBoard.push(stockLengthIn - cut)
    else remainingByBoard[boardIndex] -= cut + sawKerfIn
  }

  return remainingByBoard.length
}

export function estimateMaterials(
  members: ConstructionMember[],
  surfaces: SurfaceQuantity[],
  wasteFactorPct: number,
  consumables: ConsumableQuantity[] = [],
): EstimateResult {
  const lumberGroups = new Map<string, ShoppingListItem>()
  const cutGroups = new Map<string, CutGroup>()
  const breakdownGroups = new Map<string, ConstructionBreakdownItem>()
  const exactSurfaceItems: ShoppingListItem[] = []

  for (const member of members) {
    if (member.cutLengthIn === undefined) continue
    const material = getMaterial(member.materialId)
    if (material.category !== 'lumber' && material.category !== 'linear') continue

    const available = material.availableLengthsIn ?? []
    const cutLengthIn = member.cutLengthIn
    const purchaseLength = available.find((length) => length >= cutLengthIn)
    const groupLength = purchaseLength ?? Math.ceil(cutLengthIn / 12) * 12
    const shoppingKey = `${member.materialId}:${groupLength}`
    const cutGroup = cutGroups.get(shoppingKey)
    if (cutGroup) cutGroup.cutsIn.push(cutLengthIn)
    else
      cutGroups.set(shoppingKey, {
        materialId: member.materialId,
        stockLengthIn: groupLength,
        cutsIn: [cutLengthIn],
        note: purchaseLength ? undefined : 'Longer than the built-in stock-length catalog',
      })

    const breakdownKey = `${member.assembly}:${member.materialId}`
    const breakdown = breakdownGroups.get(breakdownKey)
    if (breakdown) breakdown.count = (breakdown.count ?? 0) + 1
    else {
      breakdownGroups.set(breakdownKey, {
        id: breakdownKey,
        assembly: member.assembly,
        materialId: member.materialId,
        label: material.shortName,
        count: 1,
      })
    }
  }

  for (const [shoppingKey, group] of cutGroups) {
    const material = getMaterial(group.materialId)
    lumberGroups.set(shoppingKey, {
      id: shoppingKey,
      materialId: group.materialId,
      label: material.name,
      count: packedStockCount(group.cutsIn, group.stockLengthIn),
      unit: material.unit,
      purchaseLengthIn: group.stockLengthIn,
      note: group.note,
    })
  }

  const surfaceGroups = new Map<MaterialId, SurfacePurchaseGroup>()
  for (const surface of surfaces) {
    if (surface.exactPurchaseCount !== undefined) {
      const material = getMaterial(surface.materialId)
      exactSurfaceItems.push({
        id: `${surface.materialId}:layout:${surface.id}`,
        materialId: surface.materialId,
        label: material.name,
        count: surface.exactPurchaseCount,
        unit: material.unit,
        purchaseLengthIn: surface.purchaseLengthIn,
        note: surface.purchaseNote,
      })
    } else {
      const surfaceGroup = surfaceGroups.get(surface.materialId) ?? {
        coverageAreaSqIn: 0,
        sourceSheetCount: 0,
      }
      if (surface.sourceSheetCount !== undefined) {
        surfaceGroup.sourceSheetCount += surface.sourceSheetCount
      } else {
        surfaceGroup.coverageAreaSqIn += surface.areaSqIn
      }
      surfaceGroups.set(surface.materialId, surfaceGroup)
    }

    const key = `${surface.assembly}:${surface.materialId}`
    const current = breakdownGroups.get(key)
    if (current) current.areaSqIn = (current.areaSqIn ?? 0) + surface.areaSqIn
    else {
      breakdownGroups.set(key, {
        id: key,
        assembly: surface.assembly,
        materialId: surface.materialId,
        label: getMaterial(surface.materialId).shortName,
        areaSqIn: surface.areaSqIn,
      })
    }
  }

  const surfaceItems: ShoppingListItem[] = []
  for (const [materialId, group] of surfaceGroups) {
    const material = getMaterial(materialId)
    const coverage = material.coverageSqFt ?? 1
    const wasteMultiplier = 1 + wasteFactorPct / 100
    const adjustedArea = squareInchesToSquareFeet(group.coverageAreaSqIn) * wasteMultiplier
    const sourceSheetPurchaseCount = Math.ceil(group.sourceSheetCount * wasteMultiplier)
    const coveragePurchaseCount = Math.ceil(adjustedArea / coverage)
    const noteParts: string[] = []
    if (group.sourceSheetCount > 0) {
      noteParts.push(`${group.sourceSheetCount} laid-out source sheets`)
    }
    if (group.coverageAreaSqIn > 0) {
      noteParts.push(`${Math.round(adjustedArea)} sq ft coverage`)
    }
    noteParts.push(`including ${wasteFactorPct}% waste`)
    surfaceItems.push({
      id: `${materialId}:coverage`,
      materialId,
      label: material.name,
      count: sourceSheetPurchaseCount + coveragePurchaseCount,
      unit: material.unit,
      note: noteParts.join(' · '),
    })
  }

  const consumableGroups = new Map<MaterialId, ConsumablePurchaseGroup>()
  for (const consumable of consumables) {
    const adjustedRequiredCount = Math.ceil(
      (consumable.requiredCount * (100 + consumable.overagePct)) / 100,
    )
    const group = consumableGroups.get(consumable.materialId) ?? {
      adjustedRequiredCount: 0,
      notes: new Set<string>(),
    }
    group.adjustedRequiredCount += adjustedRequiredCount
    group.notes.add(consumable.note)
    consumableGroups.set(consumable.materialId, group)

    const breakdownKey = `${consumable.assembly}:${consumable.materialId}`
    const breakdown = breakdownGroups.get(breakdownKey)
    if (breakdown) breakdown.count = (breakdown.count ?? 0) + Math.ceil(consumable.requiredCount)
    else {
      breakdownGroups.set(breakdownKey, {
        id: breakdownKey,
        assembly: consumable.assembly,
        materialId: consumable.materialId,
        label: getMaterial(consumable.materialId).shortName,
        count: Math.ceil(consumable.requiredCount),
      })
    }
  }

  const consumableItems: ShoppingListItem[] = [...consumableGroups.entries()].map(
    ([materialId, group]) => {
      const material = getMaterial(materialId)
      const packageQuantity = material.packageQuantity ?? 1
      return {
        id: `${materialId}:consumable`,
        materialId,
        label: material.name,
        count: Math.ceil(group.adjustedRequiredCount / packageQuantity),
        unit: material.unit,
        note: `Approximately ${group.adjustedRequiredCount} required including connection-specific planning overage. ${[...group.notes].join(' ')}`,
      }
    },
  )

  const shoppingList = [
    ...lumberGroups.values(),
    ...surfaceItems,
    ...exactSurfaceItems,
    ...consumableItems,
  ].sort((a, b) => a.label.localeCompare(b.label))

  return {
    shoppingList,
    breakdown: [...breakdownGroups.values()].sort(
      (a, b) => a.assembly.localeCompare(b.assembly) || a.label.localeCompare(b.label),
    ),
  }
}
