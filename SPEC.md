# BuildIt — MVP Product Specification

## 1. Product Summary

BuildIt is a personal, open-source, construction-aware 3D planning app for basic sheds, cabins, and small off-grid living structures. It helps inexperienced builders create a conceptually buildable design, understand how dimensions affect construction, and estimate primary materials without producing certified plans or construction blueprints.

The defining principle is that the 3D model, framing, guidance, and material estimate must all be generated from the same construction model.

## 2. Initial Scope

The first release should let a user:

- Start from a shed or cabin template.
- Create and resize a rectangular structure using drag controls or exact dimensions.
- Choose a basic foundation, floor, wall, and roof configuration.
- Add, move, resize, and remove doors and windows.
- Orbit, pan, and zoom around the 3D model.
- Snap dimensions and components to useful construction points.
- See framing and material quantities update while designing.
- Receive plain-language material and sizing suggestions that can be ignored.
- Optionally configure basic insulation and interior finishes for living use.
- Save and reopen portable project files locally.
- View an approximate materials list based on the current design.

### MVP Reference Design

The first complete design path will be an 8×10-foot wood-framed shed. It is the reference used to develop and test the construction model before adding more building types.

The reference design includes:

- A skid foundation and framed platform floor.
- An adjustable framed wall height with a standard 8-foot-room default using 92⅝-inch precut studs.
- Rectangular 2×4 walls framed 16 inches on center by default.
- A gable roof with adjustable pitch and overhang.
- A framed door opening and optional rectangular windows.
- Floor, wall, gable, and roof sheathing laid out as visible 4×8 panels, plus a water-resistive barrier, basic siding, and a 29-gauge 9–36 exposed-fastener metal roof assembly.
- Optional insulation and interior finish layers.

Member sizes and spacing are modeling inputs, not span approval. The reference design must exercise every shared system: editing, framing, openings, geometry, validation, saving, guidance, and estimation.

## 3. Core Requirements

### 3D Model

- Update the model immediately when design values change.
- Show the main construction layers and framing in a simplified form.
- Provide distinct framing, sheathing, weather-barrier, finished-exterior, and combined X-ray inspection views.
- Let the user fit the camera to the current building without changing the design.
- Prevent invalid geometry, such as openings outside a wall.
- Use inches internally and display dimensions clearly as feet and inches.
- Treat authored width and length as outside-to-outside structural framing dimensions, not interior or finished-envelope dimensions.

### Design Interaction

- Provide direct drag controls together with exact numeric inputs.
- Snap to framing centers, common dimensions, and material boundaries where useful.
- Show the user why a suggested dimension or placement is helpful.
- Permit intentional non-standard choices when they do not create invalid geometry.
- Prefer guidance and warnings over silently changing the design.
- Keep drag controls and exact dimension fields synchronized.
- Support undo and redo for design changes.

### Construction System

- Support conventional wood framing as the initial construction type.
- Include basic foundation, floor, wall, roof, sheathing, weather-barrier, siding, and roofing assemblies.
- Initially support 2×4 and 2×6 walls with 16-inch and 24-inch framing spacing.
- Model single bottom plates, double top plates, corners, and framed openings.
- Model the reference gable roof as paired bearing rafters with birdsmouths, a ridge board, low rafter ties, ridge straps, eave subfascia, straight unnotched fly rafters, and slope-cut gable framing.
- Support the reference rake overhang with on-edge cantilevered outlookers running from the fly rafter across a dropped gable top plate to the first full common rafter; do not treat a decorative ladder assembly as equivalent support.
- Lay out sheet goods in standard 4×8 panels with explicit joints, staggered floor and roof courses, and opening/slope cuts.
- Preserve source-sheet identity through door and window cuts: render notched or holed sheets as one selectable panel, show only real inter-sheet seams, and count the source sheet before considering reusable offcuts.
- Establish studs, joists, and rafters from one outside-edge layout datum so panel end joints remain aligned with framing.
- Center structural panel end joints over framing; add explicit backing or blocking where openings or horizontal joints interrupt primary framing.
- Treat framed wall height and exterior-envelope height separately; wall sheathing and siding must close the subfloor edge and overlap the rim rather than stopping at the deck, while maintaining the configured ground clearance.
- Use supported lower closure strips from 4×8 offcuts for the reference shed and flash every weather-exposed horizontal cladding interruption as required by the selected siding assembly, including wall-to-gable joints and opening heads.
- Keep structural panel joints, cladding joints, opening flashing, and roof flashing as distinct construction details; they do not share one generic seam treatment.
- Run the reference 36-inch-coverage metal panels continuously from eave to ridge over compatible underlayment, with a one-inch eave extension, eave/drip trim, rake trim, profiled closures, and a solid ridge cap. Derive panel count and order length from the installed layout rather than roof area and blanket sheet waste.
- Derive panel layouts from structural faces; use explicit corner-lap and trim rules instead of enlarging every sheet grid by finish thickness.
- Derive visible member profiles and semantic cut intent from the same construction dimensions.
- Apply practical rules for dimensions, framing layout, and supported openings.
- Flag obvious construction conflicts without claiming engineering approval.

### Material-Aware Guidance

- Maintain a catalog of nominal and actual lumber sizes, common board lengths, sheet sizes, coverage values, and waste factors.
- Initially support standard US lumber sizes and 4×8 sheet goods.
- Explain when a dimension or component placement creates notable extra material or waste.
- Allow standard materials and defaults to be configured without changing geometry code.
- Store cladding layout, clearance, joint, and flashing behavior in material installation profiles rather than branching on product names in geometry code.
- Keep recommendations advisory; unusual dimensions remain valid when construction rules allow them.

Guidance has three levels:

- **Suggestion:** A nearby choice may fit standard materials better.
- **Warning:** The design is unusual, wasteful, or potentially impractical.
- **Blocked:** The change would create impossible or internally invalid geometry.

### User Interface

- Provide a 3D workspace and a compact configuration panel.
- Keep common actions visible and understandable without training.
- Support desktop browsers first; tablet and mobile are secondary.

### Project Data

- Represent each design as structured, versioned project data.
- Store dimensions, use type, construction settings, assemblies, and placed components.
- Store designs as readable `.buildit.json` files suitable for Git.
- Support open, save, save-as, import, and export workflows where the browser permits.
- Use browser storage only for autosave and recovery, not as the permanent source of truth.
- Do not store generated meshes or calculated material totals in project files.

### Materials

- Estimate primary lumber, panels, weather barrier, flashing, siding, roofing, insulation, and finish materials.
- Recalculate quantities when the design changes.
- Provide both a construction breakdown and a grouped purchase estimate.
- Show conceptual per-member cut intent where it is needed to explain assembly fit.
- Keep retailer pricing and advanced cut optimization outside the MVP.
- Clearly label quantities as planning estimates that may require waste factors and field adjustment.

## 4. Application Framework

- **Application:** TypeScript, React, and Vite.
- **3D:** Three.js through React Three Fiber.
- **State:** A small Zustand store for the active design and editor state.
- **Domain:** Framework-independent building rules, assemblies, units, and validation.
- **Geometry:** Deterministic conversion of the construction model into 3D objects.
- **Estimation:** Material quantities derived from the same assemblies used for geometry.
- **Persistence:** Versioned JSON project files, validated on load, with local autosave recovery.
- **Testing:** Unit tests for construction and estimation rules, plus a small browser test suite.

The app will be local-first and require no server, account, or cloud database. Tracked designs will live in a top-level `designs/` directory and can be rebuilt from a Git checkout.

### Assembly Direction

- Treat `shed` and `cabin` as intent presets, not separate geometry engines.
- A preset should propose a coherent foundation, structural, weather-control, insulation, and finish assembly; the project file should save the resolved choices explicitly.
- Keep the weather-control assembly valid independently of insulation. A simple shed may omit thermal and interior layers, while a cabin may add insulation, air control, climate-appropriate vapor control, and an interior finish.
- Resolve material-specific installation behavior through typed profiles. Future panel, lap, board-and-batten, metal, or other cladding can provide its own layout and joint rules while reusing the wall geometry.
- Give roofing materials the same typed installation behavior: coverage width, rib profile, minimum pitch, eave allowance, fastening assumptions, and required trim drive both geometry and estimation.
- Keep code- or climate-dependent recommendations in guidance until BuildIt has enough project context to select them safely.

The MVP will be a desktop-first web app, developed primarily against Chromium while retaining normal modern Firefox and Safari compatibility. The project will use the MIT license. An installable desktop or PWA version may be considered later.

### Data Flow

```text
Project inputs
    → construction model
        → validation and guidance
        → framing and 3D geometry
        → material estimate
```

## 5. Out of Scope for the First Release

- Structural engineering or code-compliance certification.
- Permit-ready plans or jurisdiction-specific code checking.
- Detailed electrical, plumbing, or HVAC design.
- Automated structural calculations or span approval.
- Photorealistic rendering.
- Multi-user collaboration or cloud accounts.
- Automated pricing, ordering, or contractor workflows.
- Free-form or curved building footprints.

## 6. Success Criteria

A first-time user can open the reference 8×10 shed, change its dimensions and wall height, place an opening, inspect its basic framing, and save the result within ten minutes. The 3D model, framing, validation, and material estimate update together, and the app explains any notable material consequence.

The reference design can be reconstructed solely from its committed `.buildit.json` file and produces deterministic framing and material results covered by automated tests.

## 7. Open Decisions

- Additional siding and roofing systems after the reference materials.
- Door and window presets included at launch.
- Shed and cabin assembly presets, including the depth of insulation, air-control, vapor-control, and interior-finish options.
- Default waste factors and how estimates communicate uncertainty.

## 8. Product Boundary

BuildIt provides conceptual designs and approximate material requirements. It does not determine legal permission to build, verify local codes, replace professional engineering, or guarantee structural performance. Locations such as rural Missouri or Arkansas describe the intended off-grid use case but are not hard-coded regulatory targets.
