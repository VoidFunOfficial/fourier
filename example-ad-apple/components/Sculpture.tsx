import { useRef } from '@fourier-video/sdk';
import { AmbientLight, Color, DirectionalLight, FourierCanvas, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, TorusGeometry, type Object3D } from '@fourier-video/sdk/three';
import { disposeTree, makeEnvironment } from './Product.tsx';
import { C, smooth, lerp } from './design.ts';
export function Sculpture() {
    const refs = useRef<{
        solid: Group;
        wire: Group;
    } | null>(null);
    return <FourierCanvas style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }} onCreate={({ renderer, scene, camera }) => {
            renderer.setClearColor(new Color(C.paper), 1);
            const env = makeEnvironment(renderer);
            scene.environment = env.texture;
            const solid = new Group(), wire = new Group();
            for (let i = 0; i < 9; i++) {
                const geometry = new TorusGeometry(1.7 + i * .035, .055 + i * .008, 14, 160);
                const material = new MeshStandardMaterial({ color: i < 3 ? C.peach : i < 6 ? '#b9b9bd' : '#d9dadc', metalness: .88, roughness: .23, transparent: true });
                const mesh = new Mesh(geometry, material);
                mesh.rotation.x = i * .17;
                mesh.rotation.y = i * .20;
                solid.add(mesh);
                const sketch = new Mesh(geometry.clone(), new MeshStandardMaterial({ color: '#666669', wireframe: true, transparent: true, opacity: 1, roughness: 1 }));
                sketch.rotation.copy(mesh.rotation);
                wire.add(sketch);
            }
            scene.add(solid, wire);
            const a = new AmbientLight('#ffffff', 1.2);
            const k = new DirectionalLight('#ffffff', 3);
            k.position.set(-3, 4, 8);
            scene.add(a, k);
            camera.position.set(0, 1, 8);
            camera.lookAt(0, 0, 0);
            refs.current = { solid, wire };
            return () => { refs.current = null; scene.remove(solid, wire, a, k); disposeTree(solid); disposeTree(wire); env.dispose(); scene.environment = null; };
        }} onFrame={({ timeSeconds: t, camera }) => {
            const r = refs.current;
            if (!r)
                return;
            const p = smooth((t - .9) / 1.15);
            const angle = t * .6;
            for (const obj of [r.solid, r.wire]) {
                obj.rotation.set(.3 + t * .13, angle, -.15);
                obj.scale.setScalar(.70 + smooth(t / 1.2) * .20 + smooth((t - 4.1) / .9) * 2);
                obj.position.x = 2;
            }
            const fade = (g: Object3D, o: number) => g.traverse(a => {
                if (a instanceof Mesh)
                    (a.material as MeshStandardMaterial).opacity = o;
            });
            fade(r.solid, p);
            fade(r.wire, 1 - p);
            camera.position.set(Math.sin(t * .28) * .5, .4, 8);
            camera.lookAt(.45, 0, 0);
            if (camera instanceof PerspectiveCamera) {
                camera.fov = 37;
                camera.updateProjectionMatrix();
            }
        }}/>;
}
