import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

/**
 * Exporteert de keramische tegel-mesh als GLB (WebGL/3D) en start een browserdownload.
 * Decoratieve kinderen (gloed, barst, scherven) worden weggelaten.
 */
export async function downloadTileAsGlb(tileMesh, filename = "mijn-tegeltje.glb") {
  if (!tileMesh?.isMesh) return false;

  const exportMesh = tileMesh.clone(true);
  exportMesh.position.set(0, 0, 0);
  exportMesh.rotation.set(0, 0, 0);
  exportMesh.scale.set(1, 1, 1);
  exportMesh.updateMatrixWorld(true);

  while (exportMesh.children.length > 0) {
    exportMesh.remove(exportMesh.children[0]);
  }

  const materials = Array.isArray(exportMesh.material)
    ? exportMesh.material
    : [exportMesh.material];
  materials.forEach((mat) => {
    if (!mat) return;
    mat.opacity = 1;
    mat.transparent = false;
    mat.needsUpdate = true;
  });

  const exporter = new GLTFExporter();
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(
      exportMesh,
      resolve,
      reject,
      { binary: true },
    );
  });

  const blob = new Blob([glb], { type: "model/gltf-binary" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
