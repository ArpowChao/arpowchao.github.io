"""Create the browser model's editable final W-contact / Cu cross section.

Run from this directory: blender --background --python create_wafer.py
Requires Node.js on PATH to read the shared deterministic process model.
Outputs wafer_process.blend and wafer_process.glb beside this script.
"""
import bpy
import json
import mathutils
import subprocess
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent
model = json.loads(subprocess.check_output(
    ["node", str(OUTPUT.parent / "export-blender.mjs")], text=True
))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
materials = {}


def material(color):
    if color in materials:
        return materials[color]
    rgb = tuple(int(color[i:i+2], 16) / 255 for i in (1, 3, 5))
    result = bpy.data.materials.new(color)
    result.diffuse_color = (*rgb, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Metallic"].default_value = 0.45 if color in ("#d7e0e8", "#e9a060", "#ffe0a3") else 0.08
    shader.inputs["Roughness"].default_value = 0.5
    materials[color] = result
    return result


# Browser y is up, while Blender z is up. The front cut face stays at y=0.
def axes(values):
    return (values[0], values[2], values[1])


for index, part in enumerate(model["solids"]):
    bpy.ops.mesh.primitive_cube_add(size=1, location=axes(part["position"]))
    obj = bpy.context.object
    obj.name = f'{index:03d} {part["name"]}'
    obj.dimensions = axes(part["size"])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material(part["color"]))

for index, marker in enumerate(model["markers"]):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8,
        radius=marker["radius"], location=axes(marker["position"]))
    obj = bpy.context.object
    obj.name = f'Implanted dopant section marker {index:03d}'
    obj.data.materials.append(material(marker["color"]))

bpy.ops.object.camera_add(location=(5.2, 7.0, 4.4))
camera = bpy.context.object
camera.name = "Cross section camera"
direction = mathutils.Vector((0, -0.8, 0.4)) - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 7.8
bpy.context.scene.camera = camera
for name, location, power in [("Key softbox", (4, 3, 6), 900), ("Cool rim", (-3, -3, 4), 650)]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.shape = "DISK"
    light.data.size = 5

scene = bpy.context.scene
scene["Process example"] = "Thin oxide retained until contact etch; W contacts; Cu barrier / seed / electroplate / CMP"
scene["Scale"] = "Exaggerated local cross section, not a complete transistor or TCAD model"
scene.render.resolution_x = 1200
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "wafer_process.blend"))
bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.data.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "wafer_process.glb"), export_format="GLB", use_selection=True)
print(f"Saved editable cross section and GLB to {OUTPUT}")