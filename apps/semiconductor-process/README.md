# Semiconductor process simulation

Run `node apps/semiconductor-process/preview.mjs` from the repository root, then open `http://127.0.0.1:4173/apps/semiconductor-process/`. The simulation runs in the browser with a vendored copy of Three.js 0.180.0 and does not require a build step. `simulation.js` contains seven procedural 3D scenes and the step controls.

The supplied video informed the crystal-growth and cutting scenes. Steps 3–7 use an enlarged local cross section rather than putting microscopic structures on an entire wafer. Exposure changes resist solubility before development changes its geometry; etching removes only exposed oxide; implantation is shown inside silicon. The final scene demonstrates copper filling a dielectric trench and vias, followed by CMP removal of the overburden. It does not claim to manufacture a complete transistor in seven operations.

Process descriptions were checked against [SUMCO's wafer production overview](https://www.sumcosi.com/english/products/process/) and [ASML's microchip manufacturing overview](https://www.asml.com/en/technology/all-about-microchips/how-microchips-are-made).
The copper example follows [Lam Research's explanation of interconnects](https://newsroom.lamresearch.com/Tech-Brief-An-Introduction-to-Interconnects).

`process-model.mjs` defines deterministic process states, phase timing and the shared mask openings. Check the physical state constraints with:

```sh
node --test apps/semiconductor-process/process-model.test.mjs
```

## Blender source

`blender/create_wafer.py` generates an editable final-wafer scene and a GLB reference asset when run with Blender:

```sh
blender --background --python blender/create_wafer.py
```

Blender is not needed to view the interactive page. The current page draws its models procedurally in Three.js, so it works even before the Blender script is run.
