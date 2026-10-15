# Semiconductor process simulation

Run `node apps/semiconductor-process/preview.mjs` from the repository root, then open `http://127.0.0.1:4173/apps/semiconductor-process/`. The simulation runs in the browser with a vendored copy of Three.js 0.180.0 and does not require a build step. `simulation.js` contains ten procedural 3D scenes and the step controls.

The supplied video informed the crystal-growth and cutting scenes. Steps 3–10 use an enlarged local cross section. The process follows the requested screen-oxide / resist-masked implant / W contact / Cu interconnect example:

1. Rotating Czochralski crystal growth.
2. Wire sawing with physical kerfs and separation only after cutting through.
3. Thin protective screen oxide, consuming some silicon as it grows.
4. Thick positive resist: exposure changes solubility; development removes exposed resist while the oxide remains continuous.
5. Implantation at **7° from the surface normal** through the thin oxide. Thick resist blocks the beam, including at opening sidewalls. Dopant markers and displaced lattice sites are inside silicon.
6. **Strip resist first, then anneal** to repair damage and activate dopants. Keep the thin oxide.
7. Deposit contact dielectric; another lithography/etch opens the contact through the dielectric and retained oxide. Add a simplified contact interface/liner, blanket W deposition and W CMP.
8. Add interconnect oxide, etch trench/vias landing on W, then blanket barrier and continuous Cu seed over field, floors and sidewalls.
9. Electroplate all seeded surfaces, using a rectangular surface offset. The example field plating thickness is **1.75 × via depth**, within the requested 1.5–2 range.
10. Cu CMP clears field Cu, seed and barrier and stops at the oxide top. Embedded Cu connects through W to silicon.

The 7° angle and 1.75 ratio are **example settings**, not universal recipes. Thicknesses, lattice markers and time are exaggerated. The lattice overlay is a displacement schematic, not a diamond-lattice reconstruction. Implant energy, twist, diffusion, electrochemical additives/superfill, seams/voids, CMP dishing and erosion are not solved. The two contacts illustrate a connection path; gates, complete transistors, epitaxy and many intermediate processes are omitted. The selected interconnect branch is Cu damascene; earlier M1 aluminum wiring is explained in the notes, not animated as a second recipe.

Process references:

- [SUMCO wafer production](https://www.sumcosi.com/english/products/process/) and [ASML microchip manufacturing](https://www.asml.com/en/technology/all-about-microchips/how-microchips-are-made).
- [TU Wien: implant tilt/twist and channeling](https://www.iue.tuwien.ac.at/phd/wittmann/node7.html), [screen-oxide implant examples comparing 7° and 0°](https://www.iue.tuwien.ac.at/phd/hoessinger/node5.html), and [damage and annealing](https://www.iue.tuwien.ac.at/phd/radi/node10.html).
- [Applied Materials: conventional W contact liner and fill](https://www.appliedmaterials.com/us/en/blog/blog-posts/introducing-a-breakthrough-in-2d-scaling.html).
- [Applied Materials: barrier/seed continuity, sidewall and bottom coverage](https://www.appliedmaterials.com/tw/zh_tw/semiconductor/products/create/metals-deposition/endura-amber-pvd.html).
- [Lam Research: interconnects, aluminum and Cu damascene/CMP](https://newsroom.lamresearch.com/Tech-Brief-An-Introduction-to-Interconnects).

`process-model.mjs` defines deterministic states, phase timing, implant trajectories and the surface-offset geometry used by the renderer. The tests check mask/oxide retention, operation ordering, actual beam angle, seed coverage, W landing and CMP geometry. Run:

```sh
node --test apps/semiconductor-process/process-model.test.mjs
```

## Blender source

`blender/create_wafer.py` generates an editable final cross-section with thin oxide, W contacts and embedded Cu, plus a GLB reference asset, when run with Blender. Node.js must be on PATH: the script reads `export-blender.mjs`, which derives the final solids from the same `process-model.mjs` as the browser, rather than keeping a separate geometry recipe. Run from the app directory:

```sh
blender --background --python blender/create_wafer.py
```

Blender is not needed to view the interactive page. The current page draws its models procedurally in Three.js, so it works even before the Blender script is run.
