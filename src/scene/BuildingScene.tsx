import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ConstructionMember, GeneratedBuilding } from '../domain/construction'
import { getMaterial } from '../domain/materials'
import { formatFeetInches, roundTo } from '../domain/units'
import { type BuildItProject, cloneProject, type Opening } from '../model/project'
import { useBuildStore } from '../store/useBuildStore'

interface BuildingSceneProps {
  building: GeneratedBuilding
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
  const layerVisible =
    viewMode === 'both' ||
    (viewMode === 'framing' && member.layer === 'framing') ||
    (viewMode === 'envelope' && member.layer !== 'framing')

  const isTransparent = viewMode === 'both' && member.layer !== 'framing'
  const opacity = isTransparent ? (member.layer === 'finish' ? 0.2 : 0.12) : 0.92
  const gableShape = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-member.size[0] / 2, -member.size[1] / 2)
    shape.lineTo(member.size[0] / 2, -member.size[1] / 2)
    shape.lineTo(0, member.size[1] / 2)
    shape.closePath()
    return shape
  }, [member.size])

  if (!assemblyVisible || !layerVisible) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: React Three Fiber meshes are canvas objects, not DOM elements.
    <mesh
      name={member.label}
      position={member.position}
      rotation={member.rotation ?? [0, 0, 0]}
      castShadow={member.layer === 'framing'}
      receiveShadow
      onClick={(event) => {
        event.stopPropagation()
        selectMember(member.id)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
    >
      {member.shape === 'gable' ? (
        <extrudeGeometry
          args={[gableShape, { depth: member.size[2], bevelEnabled: false }]}
          onUpdate={(geometry) => geometry.center()}
        />
      ) : (
        <boxGeometry args={member.size} />
      )}
      <meshStandardMaterial
        color={selected ? '#ffbd59' : hovered ? '#efcf9b' : material.color}
        emissive={selected ? '#6d3a00' : '#000000'}
        emissiveIntensity={selected ? 0.35 : 0}
        roughness={0.78}
        metalness={member.materialId === 'metal-roofing' ? 0.32 : 0.02}
        transparent={isTransparent}
        opacity={opacity}
        depthWrite={!isTransparent}
      />
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
  wallBase: number
  color: string
  label: string
  min: number
  max: number
}

function DimensionHandle({
  axis,
  field,
  position,
  wallBase,
  color,
  label,
  min,
  max,
}: DimensionHandleProps) {
  const { camera } = useThree()
  const previewDimension = useBuildStore((state) => state.previewDimension)
  const commitPreview = useBuildStore((state) => state.commitPreview)
  const project = useBuildStore((state) => state.project)
  const original = useRef<BuildItProject | null>(null)
  const dragPlane = useRef(new THREE.Plane())
  const intersection = useRef(new THREE.Vector3())
  const dragging = useRef(false)
  const [hovered, setHovered] = useState(false)

  const valueFromPoint = (point: THREE.Vector3): number => {
    if (axis === 'x') return Math.abs(point.x) * 2
    if (axis === 'z') return Math.abs(point.z) * 2
    return point.y - wallBase
  }

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    dragging.current = true
    original.current = cloneProject(useBuildStore.getState().project)
    const point = new THREE.Vector3(...position)
    if (axis === 'y') {
      const normal = camera.getWorldDirection(new THREE.Vector3())
      normal.y = 0
      if (normal.lengthSq() < 0.01) normal.set(0, 0, 1)
      normal.normalize()
      dragPlane.current.setFromNormalAndCoplanarPoint(normal, point)
    } else {
      dragPlane.current.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), point)
    }
    const target = event.nativeEvent.target
    if (target instanceof Element) target.setPointerCapture(event.pointerId)
    document.body.style.cursor = 'grabbing'
  }

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    event.stopPropagation()
    const point = event.ray.intersectPlane(dragPlane.current, intersection.current)
    if (!point) return
    const increment = event.nativeEvent.shiftKey ? 0.25 : 1
    const nextValue = THREE.MathUtils.clamp(roundTo(valueFromPoint(point), increment), min, max)
    previewDimension(field, nextValue)
  }

  const finishDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    event.stopPropagation()
    dragging.current = false
    const target = event.nativeEvent.target
    if (target instanceof Element && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    if (original.current) commitPreview(original.current)
    original.current = null
    document.body.style.cursor = hovered ? 'grab' : 'default'
  }

  return (
    <group position={position}>
      <mesh
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'grab'
        }}
        onPointerOut={() => {
          setHovered(false)
          if (!dragging.current) document.body.style.cursor = 'default'
        }}
      >
        <sphereGeometry args={[hovered ? 4.8 : 4, 18, 18]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} />
      </mesh>
      <sprite position={[0, 8, 0]} scale={[30, 10, 1]}>
        <spriteMaterial transparent opacity={0} />
      </sprite>
      <mesh
        position={[0, 0, 0]}
        visible={false}
        userData={{ label, value: project.dimensions[field] }}
      />
    </group>
  )
}

function SceneContents({ building }: BuildingSceneProps) {
  const project = useBuildStore((state) => state.project)
  const selectMember = useBuildStore((state) => state.selectMember)
  const selectOpening = useBuildStore((state) => state.selectOpening)
  const floorDepth = getMaterial(project.floor.joistSize).actualDepthIn ?? 5.5
  const wallBase = 5.5 + floorDepth + 23 / 32
  const { widthIn, lengthIn, wallHeightIn } = project.dimensions

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
        wallBase={wallBase}
        color="#e56b38"
        label={`Width ${formatFeetInches(widthIn)}`}
        min={72}
        max={288}
      />
      <DimensionHandle
        axis="z"
        field="lengthIn"
        position={[0, wallBase + 10, lengthIn / 2 + 9]}
        wallBase={wallBase}
        color="#2e7d74"
        label={`Length ${formatFeetInches(lengthIn)}`}
        min={72}
        max={480}
      />
      <DimensionHandle
        axis="y"
        field="wallHeightIn"
        position={[-widthIn / 2 - 9, wallBase + wallHeightIn, 0]}
        wallBase={wallBase}
        color="#3d64a3"
        label={`Height ${formatFeetInches(wallHeightIn)}`}
        min={72}
        max={144}
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
        maxDistance={620}
        maxPolarAngle={Math.PI / 2.02}
        enableDamping
      />
    </>
  )
}

export function BuildingScene({ building }: BuildingSceneProps) {
  const cameraPosition = useMemo<[number, number, number]>(() => [190, 155, 215], [])

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: cameraPosition, fov: 42, near: 1, far: 1200 }}
      gl={{ antialias: true, alpha: false }}
    >
      <SceneContents building={building} />
    </Canvas>
  )
}
