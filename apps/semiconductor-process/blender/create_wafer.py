"""Create an editable wafer scene in Blender and export a GLB reference asset.

Run: blender --background --python create_wafer.py
The browser simulation uses its own procedural Three.js meshes; this file is
an optional starting point for replacing those meshes with authored assets.
"""

import bpy
import mathutils
from pathlib import Path


OUTPUT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def material(name, rgb, metallic=0.0, roughness=0.4):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*rgb, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return result


silicon = material("Silicon substrate", (0.36, 0.58, 0.65), 0.48, 0.24)
oxide = material("Silicon dioxide", (0.22, 0.66, 0.94), 0.24, 0.3)
doped = material("Doped regions", (0.62, 0.27, 0.79), 0.15, 0.36)
copper = material("Metal interconnect", (0.95, 0.55, 0.24), 0.85, 0.22)


def cylinder(name, radius, depth, location, surface):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    bevel = obj.modifiers.new("Soft machined edge", "BEVEL")
    bevel.width = min(depth * 0.14, 0.035)
    bevel.segments = 2
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def block(name, size, location, surface):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    bevel = obj.modifiers.new("Soft edge", "BEVEL")
    bevel.width = 0.01
    bevel.segments = 2
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


cylinder("01 Silicon wafer", 2.18, 0.21, (0, 0, 0), silicon)
cylinder("02 Oxide insulation", 2.15, 0.03, (0, 0, 0.12), oxide)
for row in range(-2, 3):
    for col in range(-2, 3):
        x, y = col * 0.59, row * 0.59
        block(f"03 Doped region {row:+d} {col:+d}", (0.37, 0.37, 0.018), (x, y, 0.15), doped)
for col in range(-2, 3):
    x = col * 0.59
    block(f"04 Metal bus {col:+d}", (0.08, 3.5, 0.035), (x, 0, 0.18), copper)
    for row in range(-2, 3):
        y = row * 0.59
        block(f"05 Metal branch {row:+d} {col:+d}", (0.35, 0.08, 0.035), (x + 0.2, y, 0.18), copper)

# A camera and lights make the .blend file ready to inspect and render.
bpy.ops.object.camera_add(location=(5.2, -7.0, 5.3))
camera = bpy.context.object
camera.name = "Presentation camera"
direction = mathutils.Vector((0, 0, 0)) - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = camera
for name, location, power, size in [
    ("Key softbox", (4, -3, 6), 900, 5),
    ("Cool rim", (-3, 3, 4), 650, 4),
]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.shape = "DISK"
    light.data.size = size

bpy.context.scene.render.resolution_x = 1200
bpy.context.scene.render.resolution_y = 800
bpy.context.scene.render.resolution_percentage = 100
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "wafer_process.blend"))

bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.data.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "wafer_process.glb"), export_format="GLB", use_selection=True)
print(f"Saved editable scene and GLB to {OUTPUT}")
