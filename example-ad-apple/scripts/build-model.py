"""Original Mac mini visual model. Run with Blender --background --python this-file."""
import bpy
import math
import os
import json, struct, base64
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metal=0, rough=.4):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m

silver = material('Satin aluminium', (.64,.66,.69), .82, .30)
edge = material('Machined port edge', (.56,.58,.61), .88, .22)
black = material('Port recess', (.009,.010,.012), .15, .35)
rubber = material('Graphite foot', (.025,.026,.028), .05, .54)
logo = material('Polished Apple inlay', (.018,.019,.021), .92, .17)
contacts = material('Connector tongue', (.16,.17,.19), .7, .34)
led = material('White status indicator', (.9,.94,1), .1, .2)
led.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value = (.6,.72,1,1)
led.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value = .8
parts = []

def rounded(name, width, depth, height, radius, location, mat, bevel=.022):
    verts, faces = [], []
    n = 16 if width > 1 else (2 if width < .1 else 6)
    for z in [-height/2, height/2]:
        for cx,cy,start in [(width/2-radius,depth/2-radius,0),(-width/2+radius,depth/2-radius,90),(-width/2+radius,-depth/2+radius,180),(width/2-radius,-depth/2+radius,270)]:
            for i in range(n+1):
                a = math.radians(start+i*90/n)
                verts.append((cx+radius*math.cos(a),cy+radius*math.sin(a),z))
    count=len(verts)//2
    faces.append(tuple(reversed(range(count))))
    faces.append(tuple(range(count,count*2)))
    for i in range(count):
        j=(i+1)%count
        faces.append((i,j,j+count,i+count))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    obj.location=location
    obj.data.materials.append(mat)
    if bevel:
        mod=obj.modifiers.new('Fine edge machining','BEVEL')
        mod.width=bevel
        mod.segments=3
        mod.limit_method='ANGLE'
        mod.angle_limit=.5
    for p in mesh.polygons: p.use_smooth=True
    norm=obj.modifiers.new('Weighted aluminium normals','WEIGHTED_NORMAL')
    norm.keep_sharp=True
    parts.append(obj)
    return obj

# Public dimensions 5 × 5 × 2 inches, represented in proportionate authoring units.
body=rounded('Aluminium enclosure',5,5,1.76,.59,(0,0,.13),silver,.045)
foot=rounded('Underside foot',4.28,4.28,.18,.67,(0,0,-.84),rubber,.055)
sole=rounded('Recessed thermal sole',3.90,3.90,.055,.58,(0,0,-.948),black,.022)

def port(name,x,back=False,w=.34,h=.13,roundness=.062):
    y=2.494 if back else -2.494
    z=-.13
    rim=rounded(name+' metal lip',w+.025,h+.026,.018,roundness,(x,y,z),edge,.008)
    rim.rotation_euler[0]=math.pi/2
    hole=rounded(name+' black cavity',w,h,.026,roundness*.85,(x,y+(.013 if back else -.013),z),black,.004)
    hole.rotation_euler[0]=math.pi/2
    tongue=rounded(name+' tongue',w*.73,h*.25,.018,.012,(x,y+(.030 if back else -.030),z),contacts,.002)
    tongue.rotation_euler[0]=math.pi/2

port('Front USB-C 1',-.78)
port('Front USB-C 2',-.12)

def disc(name, location, radius, depth, mat, rotation=(math.pi/2,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth, location=location, rotation=rotation)
    obj=bpy.context.object
    obj.name=name
    obj.data.materials.append(mat)
    for p in obj.data.polygons: p.use_smooth=True
    parts.append(obj)
    return obj

disc('Headphone polished ring',(1.11,-2.501,-.13),.085,.021,edge)
disc('3.5mm headphone recess',(1.11,-2.52,-.13),.064,.020,black)
disc('Status light',(1.78,-2.498,-.13),.018,.015,led)

for i,x in enumerate([.48,1.10,1.72]): port('Thunderbolt 4 '+str(i+1),x,True)
port('HDMI',-.30,True,.52,.17,.028)
port('2.5Gb Ethernet',-1.10,True,.43,.34,.026)
port('Power socket',-1.86,True,.40,.19,.09)
for x in [-1.97,-1.75]: disc('Power pin',(x,2.54,-.13),.025,.04,contacts)

# Fine perimeter vents communicate the published bottom airflow without inventing internals.
for i in range(47):
    x=-1.63+i*.070
    for side in [-1,1]:
        rounded('Foot vent',.024,.18,.016,.008,(x,side*1.88,-.963),rubber,.001)
disc('Power button',(-1.79,1.57,-.956),.16,.022,rubber,(0,0,0))
disc('Power symbol inset',(-1.79,1.57,-.970),.073,.006,black,(0,0,0))

bpy.ops.object.text_add(location=(0,-.05,1.016))
mark=bpy.context.object
mark.name='Apple logo inlay'
mark.data.body='\uf8ff'
mark.data.align_x='CENTER'
mark.data.align_y='CENTER'
mark.data.font=bpy.data.fonts.load('/System/Library/Fonts/SFNS.ttf')
mark.data.size=1.21
mark.data.extrude=.002
mark.data.bevel_depth=.001
mark.data.materials.append(logo)
bpy.ops.object.convert(target='MESH')
parts.append(bpy.context.object)

# Export only authored product meshes; GLB conversion supplies Y-up coordinates.
bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active=body
out=os.path.join(ROOT,'assets/model/mac-mini-m6.glb')
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT')
# The project renderer fingerprints JSON assets; retain a self-contained glTF JSON
# alongside the GLB because this renderer version scans .glb as source text.
raw=open(out,'rb').read()
json_length=struct.unpack_from('<I',raw,12)[0]
gltf=json.loads(raw[20:20+json_length])
bin_offset=20+json_length
bin_length=struct.unpack_from('<I',raw,bin_offset)[0]
binary=raw[bin_offset+8:bin_offset+8+bin_length]
gltf['buffers'][0]['uri']='data:application/octet-stream;base64,'+base64.b64encode(binary).decode('ascii')
encoded=json.dumps(gltf,separators=(',',':'))
assert len(encoded.encode()) < 2*1024*1024
open(os.path.join(ROOT,'assets/model/mac-mini-m6.gltf.json'),'w').write(encoded)

# Useful non-exported studio for the editable .blend file.
studio_mat=material('Studio paper',(.85,.85,.85),0,.75)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-1.03))
bpy.context.object.name='Studio ground (not exported)'
bpy.context.object.data.materials.append(studio_mat)
for name,loc,power,size in [('Key',(-4,-4,7),1100,5),('Rim',(4,2,5),1400,4),('Fill',(0,-5,2),450,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    obj=bpy.context.object
    obj.name=name
    obj.data.energy=power
    obj.data.shape='DISK'
    obj.data.size=size
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(8,-11,7))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.lens=55
bpy.context.scene.camera=cam
bpy.context.scene.render.engine='CYCLES'
bpy.context.scene.cycles.samples=32
bpy.context.scene.render.resolution_x=1600
bpy.context.scene.render.resolution_y=1000
bpy.context.scene.render.resolution_percentage=100
bpy.context.scene.world.color=(.4,.4,.4)
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets/model/mac-mini-m6.blend'))
print('MODEL_READY',out,len(parts),'meshes')
