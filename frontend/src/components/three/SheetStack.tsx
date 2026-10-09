import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * A drawer of documents. Sheets the viewer may read show their lines of text
 * and lift out of the stack in turn; restricted sheets stay down, redacted.
 */
export default function SheetStack() {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // no WebGL: the hero simply shows without the scene
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 0.5, 11.5);
    const stack = new THREE.Group();
    stack.rotation.set(0.12, -0.62, 0);
    scene.add(stack);

    const ink = 0x1b2230, green = 0x0f766e, grey = 0xc9bfa9;
    const paper = new THREE.PlaneGeometry(2.2, 3);
    const outline = new THREE.EdgesGeometry(paper);
    const disposables: { dispose: () => void }[] = [paper, outline];
    const bar = (w: number, h: number, color: number, opacity = 1) => {
      const geometry = new THREE.PlaneGeometry(w, h);
      const material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
      disposables.push(geometry, material);
      return new THREE.Mesh(geometry, material);
    };

    const COUNT = 9;
    const widths = [1.5, 1.2, 1.62, 0.9, 1.4, 1.55, 1.1, 1.6, 0.7];
    const sheets: { group: THREE.Group; open: boolean; index: number }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const open = i % 3 !== 1;
      const group = new THREE.Group();
      const fill = new THREE.MeshBasicMaterial({ color: open ? 0xfffcf6 : 0xebe3d2, side: THREE.DoubleSide });
      const edge = new THREE.LineBasicMaterial({ color: open ? ink : grey });
      disposables.push(fill, edge);
      group.add(new THREE.Mesh(paper, fill), new THREE.LineSegments(outline, edge));

      const headingWidth = open ? 0.9 : 1.1;
      const heading = bar(headingWidth, 0.09, ink, open ? 1 : 0.85);
      heading.position.set(-0.86 + headingWidth / 2, 1.12, 0.004);
      group.add(heading);
      for (let row = 0; row < 8; row++) {
        const width = open ? widths[(row + i) % widths.length] : 1.72;
        const line = bar(width, open ? 0.035 : 0.1, open ? 0x9a948a : ink, open ? 1 : 0.88);
        line.position.set(-0.86 + width / 2, 0.72 - row * 0.26, 0.004);
        group.add(line);
      }
      if (open) {
        const seal = bar(0.2, 0.2, green);
        seal.position.set(0.82, 1.14, 0.004);
        group.add(seal);
      }
      group.position.set(0, 0, (i - (COUNT - 1) / 2) * -0.62);
      stack.add(group);
      sheets.push({ group, open, index: i });
    }

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX / window.innerWidth - 0.5;
      pointer.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const openSheets = sheets.filter((s) => s.open);
    let frame = 0;
    const draw = (ms: number) => {
      const t = ms / 1000;
      // One readable sheet at a time lifts out of the drawer, then settles back.
      const turn = (t / 2.6) % openSheets.length;
      sheets.forEach((s) => {
        const slot = openSheets.indexOf(s);
        let lift = 0;
        if (slot >= 0) {
          const phase = turn - slot;
          const local = phase < 0 ? phase + openSheets.length : phase;
          if (local < 1) lift = Math.sin(local * Math.PI) ** 2;
        }
        s.group.position.y = lift * 0.95 + Math.sin(t * 0.7 + s.index) * 0.025;
      });
      stack.rotation.y += (-0.62 + pointer.x * 0.35 - stack.rotation.y) * 0.05;
      stack.rotation.x += (0.12 + pointer.y * 0.18 - stack.rotation.x) * 0.05;
      renderer.render(scene, camera);
      if (!still) frame = requestAnimationFrame(draw);
    };
    draw(still ? 1300 : 0);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mount} aria-hidden="true" className="h-full w-full [&>canvas]:h-full [&>canvas]:w-full" />;
}
