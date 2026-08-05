import { Edges, Grid, Html, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ConstructionMember, GeneratedBuilding } from '../domain/construction'
import { getMaterial } from '../domain/materials'
import { formatFeetInches } from '../domain/units'
import { type BuildItProject, cloneProject, type Opening } from '../model/project'
import { useBuildStore } from '../store/useBuildStore'
import { cameraFitForBuilding } from './cameraFit'
import { projectWorldAxisToScreen, type ScreenDragState, updateScreenDrag } from './dimensionDrag'
import { memberPresentation } from './viewMode'

interface BuildingSceneProps {
  building: GeneratedBuilding
  fitViewRequest: number
}

function MemberMesh({ member }: { member: ConstructionMember }) {
  const selectedMemberId = useBuildStore((state) => state.selectedMemberId)
  const selectMember = useBuildStore((state) => state.selectMember)
  const viewMode = useBuildStore((state) => state.viewMode)
  const layerVisibility = useBuildStore((state) => state.layerVisibility)
  const [hovered, setHovered] = useState(false)
  const material = getMaterial(member.materialId)
  const selected = selectedMemberId === member.id
  const assemblyVisible = layerVisibility[member.assembly === 'walls' ? 'walls' : member.assembly]
  const presentation = memberPresentation(viewMode, member.layer)
  const isTransparent = presentation.transparent
  const opacity = presentation.opacity
  const isSheetPanel = member.label.includes(' panel ')
  const gableShape = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-member.size[0] / 2, -member.size[1] / 2)
    shape.lineTo(member.size[0] / 2, -member.size[1] / 2)
    shape.lineTo(0, member.size[1] / 2)
    shape.closePath()
    return shape
  }, [member.size])
  const profileShape = useMemo(() => {
    const points = member.profile ?? []
    const shape = new THREE.Shape()
    const first = points[0]
    if (!first) return shape
    shape.moveTo(first[0], first[1])
    for (const point of points.slice(1)) shape.lineTo(point[0], point[1])
    shape.closePath()
    return shape
  }, [member.profile])
  const cutPanelShapes = useMemo(
    () =>
      (member.profileRegions ?? []).map((region) => {
        const shape = new THREE.Shape()
        const first = region.outline[0]
        if (!first) return shape
        shape.moveTo(first[0], first[1])
        for (const point of region.outline.slice(1)) shape.lineTo(point[0], point[1])
        shape.closePath()
        for (const holePoints of region.holes) {
          const holeFirst = holePoints[0]
          if (!holeFirst) continue
          const hole = new THREE.Path()
          hole.moveTo(holeFirst[0], holeFirst[1])
          for (const point of holePoints.slice(1)) hole.lineTo(point[0], point[1])
          hole.closePath()
          shape.holes.push(hole)
        }
        return shape
      }),
    [member.profileRegions],
  )

  if (!assemblyVisible || !presentation.visible) return null

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    selectMember(member.id)
  }
  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }
  const handlePointerOut = () => {
    setHovered(false)
    document.body.style.cursor = 'default'
  }
  const materialProps = {
    color: selected ? '#ffbd59' : hovered ? '#efcf9b' : material.color,
    emissive: selected ? '#6d3a00' : '#000000',
    emissiveIntensity: selected ? 0.35 : 0,
    roughness: 0.78,
    metalness:
      member.materialId === 'metal-roofing' ||
      member.materialId === 'z-flashing' ||
      member.materialId === 'ridge-strap'
        ? 0.32
        : 0.02,
    transparent: isTransparent,
    opacity,
    depthWrite: !isTransparent,
  }

  if (member.shape === 'cut-panel') {
    const extrusion = member.profileExtrusionIn ?? Math.min(...member.size)
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: React Three Fiber groups are canvas objects, not DOM elements.
      <group
        name={member.label}
        position={member.position}
        rotation={member.rotation ?? [0, 0, 0]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {cutPanelShapes.map((shape, index) => (
          <mesh
            // The region order is deterministic for generated panel geometry.
            // biome-ignore lint/suspicious/noArrayIndexKey: regions do not carry independent identity.
            key={index}
            position={[0, 0, -extrusion / 2]}
            receiveShadow
          >
            <extrudeGeometry args={[shape, { depth: extrusion, bevelEnabled: false }]} />
            <meshStandardMaterial {...materialProps} />
            <Edges threshold={15} color={isTransparent ? '#806f58' : '#5f4a32'} />
          </mesh>
        ))}
      </group>
    )
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: React Three Fiber meshes are canvas objects, not DOM elements.
    <mesh
      name={member.label}
      position={member.position}
      rotation={member.rotation ?? [0, 0, 0]}
      castShadow={member.layer === 'framing'}
      receiveShadow
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {member.shape === 'gable' ? (
        <extrudeGeometry
          args={[gableShape, { depth: member.size[2], bevelEnabled: false }]}
          onUpdate={(geometry) => geometry.center()}
        />
      ) : member.shape === 'profile' ? (
        <extrudeGeometry
          args={[profileShape, { depth: member.size[2], bevelEnabled: false }]}
          onUpdate={(geometry) => geometry.center()}
        />
      ) : (
        <boxGeometry args={member.size} />
      )}
      <meshStandardMaterial {...materialProps} />
      {isSheetPanel ? <Edges threshold={15} color={isTransparent ? '#806f58' : '#5f4a32'} /> : null}
    </mesh>
  )
}

function openingPosition(
  project: BuildItProject,
  opening: Opening,
  wallBase: number,
): { position: [number, number, number]; size: [number, number, number] } {
  const { widthIn, lengthIn } = project.dimensions
  const centerY = wallBase + opening.sillHeightIn + opening.heightIn / 2
  if (opening.wall === 'front') {
    return {
      position: [opening.centerOffsetIn, centerY, lengthIn / 2 + 2],
      size: [opening.widthIn, opening.heightIn, 1],
    }
  }
  if (opening.wall === 'back') {
    return {
      position: [-opening.centerOffsetIn, centerY, -lengthIn / 2 - 2],
      size: [opening.widthIn, opening.heightIn, 1],
    }
  }
  if (opening.wall === 'left') {
    return {
      position: [-widthIn / 2 - 2, centerY, -opening.centerOffsetIn],
      size: [1, opening.heightIn, opening.widthIn],
    }
  }
  return {
    position: [widthIn / 2 + 2, centerY, opening.centerOffsetIn],
    size: [1, opening.heightIn, opening.widthIn],
  }
}

function OpeningMarker({ opening, wallBase }: { opening: Opening; wallBase: number }) {
  const project = useBuildStore((state) => state.project)
  const selectedOpeningId = useBuildStore((state) => state.selectedOpeningId)
  const selectOpening = useBuildStore((state) => state.selectOpening)
  const marker = openingPosition(project, opening, wallBase)
  const selected = opening.id === selectedOpeningId

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: React Three Fiber meshes are canvas objects, not DOM elements.
    <mesh
      position={marker.position}
      onClick={(event) => {
        event.stopPropagation()
        selectOpening(opening.id)
      }}
    >
      <boxGeometry args={marker.size} />
      <meshBasicMaterial
        color={selected ? '#ffb13b' : '#263641'}
        wireframe
        transparent
        opacity={selected ? 1 : 0.42}
      />
    </mesh>
  )
}

type DimensionField = keyof BuildItProject['dimensions']

interface DimensionHandleProps {
  axis: 'x' | 'y' | 'z'
  field: DimensionField
  position: [number, number, number]
  color: string
  label: string
  min: number
  max: number
  onDragStateChange: (dragging: boolean) => void
}

interface CapturedPointerTarget {
  setPointerCapture: (pointerId: number) => void
  hasPointerCapture: (pointerId: number) => boolean
  releasePointerCapture: (pointerId: number) => void
}

function DimensionHandle({
  axis,
  field,
  position,
  color,
  label,
  min,
  max,
  onDragStateChange,
}: DimensionHandleProps) {
  const { camera, size } = useThree()
  const previewDimension = useBuildStore((state) => state.previewDimension)
  const commitPreview = useBuildStore((state) => state.commitPreview)
  const project = useBuildStore((state) => state.project)
  const original = useRef<BuildItProject | null>(null)
  const dragState = useRef<ScreenDragState | null>(null)
  const pointerId = useRef<number | null>(null)
  const capturedTarget = useRef<CapturedPointerTarget | null>(null)
  const draggingRef = useRef(false)
  const hoveredRef = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)

  const setHandleHovered = (nextHovered: boolean) => {
    hoveredRef.current = nextHovered
    setHovered(nextHovered)
  }

  const finishDrag = useCallback(
    (commit: boolean) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragging(false)
      onDragStateChange(false)

      const activePointerId = pointerId.current
      if (activePointerId !== null && capturedTarget.current?.hasPointerCapture(activePointerId)) {
        capturedTarget.current.releasePointerCapture(activePointerId)
      }

      if (original.current) {
        if (commit) commitPreview(original.current)
        else previewDimension(field, original.current.dimensions[field])
      }
      original.current = null
      dragState.current = null
      pointerId.current = null
      capturedTarget.current = null
      document.body.style.cursor = hoveredRef.current ? 'grab' : 'default'
    },
    [commitPreview, field, onDragStateChange, previewDimension],
  )

  useEffect(() => {
    const cancelDrag = () => finishDrag(false)
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelDrag()
    }

    window.addEventListener('blur', cancelDrag)
    window.addEventListener('keydown', cancelWithEscape)
    return () => {
      window.removeEventListener('blur', cancelDrag)
      window.removeEventListener('keydown', cancelWithEscape)
      cancelDrag()
    }
  }, [finishDrag])

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.nativeEvent.button !== 0 || draggingRef.current) return
    event.stopPropagation()
    const source = event.nativeEvent
    const worldAxis = new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0,
    )
    dragState.current = {
      axis: projectWorldAxisToScreen(
        camera,
        new THREE.Vector3(...position),
        worldAxis,
        size.width,
        size.height,
      ),
      lastClientX: source.clientX,
      lastClientY: source.clientY,
      rawValueIn: project.dimensions[field],
      dimensionScale: axis === 'y' ? 1 : 2,
    }
    original.current = cloneProject(useBuildStore.getState().project)
    draggingRef.current = true
    setDragging(true)
    onDragStateChange(true)
    pointerId.current = event.pointerId
    capturedTarget.current = event.target as unknown as CapturedPointerTarget
    capturedTarget.current.setPointerCapture(event.pointerId)
    document.body.style.cursor = 'grabbing'
  }

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!draggingRef.current || pointerId.current !== event.pointerId || !dragState.current) return
    event.stopPropagation()
    const source = event.nativeEvent
    const nextValue = updateScreenDrag(
      dragState.current,
      source.clientX,
      source.clientY,
      source.shiftKey,
      min,
      max,
    )
    previewDimension(field, nextValue)
  }

  const guideRotation: [number, number, number] =
    axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]

  return (
    <group position={position}>
      {hovered || dragging ? (
        <mesh rotation={guideRotation}>
          <cylinderGeometry args={[0.35, 0.35, 34, 8]} />
          <meshBasicMaterial color={color} transparent opacity={dragging ? 0.9 : 0.55} />
        </mesh>
      ) : null}
      <mesh scale={dragging ? 1.35 : hovered ? 1.18 : 1}>
        <sphereGeometry args={[4, 20, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} />
      </mesh>
      <mesh
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          event.stopPropagation()
          finishDrag(true)
        }}
        onPointerCancel={(event) => {
          event.stopPropagation()
          finishDrag(false)
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHandleHovered(true)
          document.body.style.cursor = 'grab'
        }}
        onPointerOut={() => {
          setHandleHovered(false)
          if (!draggingRef.current) document.body.style.cursor = 'default'
        }}
      >
        <sphereGeometry args={[8, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hovered || dragging ? (
        <Html center position={[0, 13, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`dimension-tooltip${dragging ? ' is-dragging' : ''}`}>
            <strong>{label}</strong>
            <span>{dragging ? 'Shift: fine · Esc: cancel' : 'Click and drag'}</span>
          </div>
        </Html>
      ) : null}
    </group>
  )
}

interface DefaultControls {
  target: THREE.Vector3
  update: () => void
}

function FitViewController({
  building,
  request,
}: {
  building: GeneratedBuilding
  request: number
}) {
  const project = useBuildStore((state) => state.project)
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as DefaultControls | null
  const fitInputs = useRef({
    widthIn: project.dimensions.widthIn,
    lengthIn: project.dimensions.lengthIn,
    peakHeightIn: building.metrics.peakHeightIn,
    overhangIn: project.roof.overhangIn,
  })
  fitInputs.current = {
    widthIn: project.dimensions.widthIn,
    lengthIn: project.dimensions.lengthIn,
    peakHeightIn: building.metrics.peakHeightIn,
    overhangIn: project.roof.overhangIn,
  }

  useEffect(() => {
    if (request === 0 || !controls) return
    const inputs = fitInputs.current
    const fit = cameraFitForBuilding(
      inputs.widthIn,
      inputs.lengthIn,
      inputs.peakHeightIn,
      inputs.overhangIn,
    )
    camera.position.set(...fit.position)
    controls.target.set(...fit.target)
    camera.lookAt(...fit.target)
    camera.updateProjectionMatrix()
    controls.update()
  }, [camera, controls, request])

  return null
}

function SceneContents({ building, fitViewRequest }: BuildingSceneProps) {
  const project = useBuildStore((state) => state.project)
  const selectMember = useBuildStore((state) => state.selectMember)
  const selectOpening = useBuildStore((state) => state.selectOpening)
  const floorDepth = getMaterial(project.floor.joistSize).actualDepthIn ?? 5.5
  const wallBase = 5.5 + floorDepth + 23 / 32
  const { widthIn, lengthIn, wallHeightIn } = project.dimensions
  const roofHandleClearance = project.roof.overhangIn + 9
  const [dimensionDragging, setDimensionDragging] = useState(false)

  return (
    <>
      <color attach="background" args={['#dce6e8']} />
      <fog attach="fog" args={['#dce6e8', 380, 800]} />
      <ambientLight intensity={1.55} />
      <directionalLight
        position={[140, 240, 100]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
      />
      <group
        onPointerMissed={() => {
          selectMember(null)
          selectOpening(null)
        }}
      >
        {building.members.map((member) => (
          <MemberMesh key={member.id} member={member} />
        ))}
        {project.openings.map((opening) => (
          <OpeningMarker key={opening.id} opening={opening} wallBase={wallBase} />
        ))}
      </group>
      <DimensionHandle
        axis="x"
        field="widthIn"
        position={[widthIn / 2 + 9, wallBase + 10, 0]}
        color="#e56b38"
        label={`Width ${formatFeetInches(widthIn)}`}
        min={72}
        max={288}
        onDragStateChange={setDimensionDragging}
      />
      <DimensionHandle
        axis="z"
        field="lengthIn"
        position={[0, wallBase + 10, lengthIn / 2 + 9]}
        color="#2e7d74"
        label={`Length ${formatFeetInches(lengthIn)}`}
        min={72}
        max={480}
        onDragStateChange={setDimensionDragging}
      />
      <DimensionHandle
        axis="y"
        field="wallHeightIn"
        position={[
          -widthIn / 2 - roofHandleClearance,
          wallBase + wallHeightIn,
          lengthIn / 2 + roofHandleClearance,
        ]}
        color="#3d64a3"
        label={`Height ${formatFeetInches(wallHeightIn)}`}
        min={72}
        max={144}
        onDragStateChange={setDimensionDragging}
      />
      <Grid
        position={[0, -0.05, 0]}
        args={[720, 720]}
        cellSize={12}
        cellThickness={0.45}
        cellColor="#9daeb0"
        sectionSize={48}
        sectionThickness={1}
        sectionColor="#718587"
        fadeDistance={600}
        fadeStrength={1}
        infiniteGrid
      />
      <OrbitControls
        makeDefault
        target={[0, wallBase + wallHeightIn * 0.45, 0]}
        minDistance={80}
        maxDistance={1400}
        maxPolarAngle={Math.PI / 2.02}
        enableDamping
        enabled={!dimensionDragging}
      />
      <FitViewController building={building} request={fitViewRequest} />
    </>
  )
}

export function BuildingScene({ building, fitViewRequest }: BuildingSceneProps) {
  const cameraPosition = useMemo<[number, number, number]>(() => [190, 155, 215], [])

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: cameraPosition, fov: 42, near: 1, far: 2400 }}
      gl={{ antialias: true, alpha: false }}
    >
      <SceneContents building={building} fitViewRequest={fitViewRequest} />
    </Canvas>
  )
}
