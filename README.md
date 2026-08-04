# BuildIt

BuildIt is a local-first, material-aware 3D designer for basic sheds, cabins, and small off-grid structures. The MVP uses a fully modeled 8×10 shed to connect editable dimensions, conventional wood framing, 3D geometry, guidance, and approximate material quantities.

> BuildIt produces conceptual designs and planning estimates. It does not provide structural engineering, span approval, code verification, permit-ready plans, or permission to build.

## Current MVP

- Interactive framing, sheathing, WRB, finished-exterior, and X-ray views with camera fit
- Drag handles and exact width, length, and wall-height inputs
- Skid foundation, platform floor, framed walls, gable roof, doors, and windows
- Explicit 4×8 floor, wall, gable, and roof panel layouts with staggered joints and opening cuts
- Stock-aware 92⅝-inch wall studs with offcut-sized rim closure panels, continuous WRB, and assembly-driven flashing
- Profiled bearing rafters, straight fly rafters, dropped gable framing, cantilevered rake outlookers, ridge straps, rafter ties, and eave subfascia
- Configurable common framing sizes and 16/24-inch spacing
- Optional insulation and interior finish quantities
- Live construction breakdown and grouped purchase estimate
- Conceptual per-member cut intent derived from the visible framing geometry
- Material-fit suggestions, construction warnings, and invalid-geometry blockers
- Undo/redo, local recovery autosave, and portable `.buildit.json` files
- Git-tracked deterministic 8×10 reference design

## Run locally

Requirements: Node.js 22 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Then open the local URL printed by Vite.

## Verify

```bash
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Architecture

```text
Project JSON
    → construction domain
        → validation and material guidance
        → deterministic framing and surface geometry
        → construction breakdown and purchase estimate
    → React Three Fiber scene
```

The construction domain under `src/domain/` does not depend on React or Three.js. Project files store authored inputs only; generated meshes and material totals are rebuilt on load.

Width and length are outside-to-outside framing dimensions. Studs, joists, rafters, and panel seams share that outside-edge layout datum; structural panel end joints must land on framing, and interrupted edges receive modeled backing or blocking. A rake overhang uses a dropped gable top plate and on-edge outlookers that cantilever back to the first full common rafter; the fly rafter is an unnotched rake subfascia. Shared construction conventions—including panel sizes, joint spacing, sheathing corner ownership, exterior trim, and roof connection limits—live in the domain layer rather than being special-cased per design. Cladding materials carry typed installation profiles so layout, clearance, and flashing behavior can change without adding product-name checks to geometry code.

Important paths:

- `designs/8x10-shed.buildit.json` — committed reference design
- `src/model/` — project schema and versioning
- `src/domain/` — assemblies, material catalog, estimates, guidance, and units
- `src/scene/` — interactive 3D presentation
- `src/store/` — editor state and undo/redo
- `src/persistence/` — recovery and project-file workflows
- `SPEC.md` — MVP product specification

## Project files

BuildIt projects are readable, versioned JSON files intended to be committed to Git. Use **Open** to load a project and **Save project** to write or download it. Browser storage is only a recovery mechanism.

## License

BuildIt is released under the [MIT License](LICENSE).
