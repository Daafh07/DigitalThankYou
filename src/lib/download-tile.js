import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

/**
 * Bouwt een exporteerbaar object van een (multi-material) tegel-mesh.
 * GLTFExporter ondersteunt geen material-array op één mesh in Three r174.
 */
function buildTileExportObject(tileMesh) {
  const geometry = tileMesh.geometry;
  const materials = Array.isArray(tileMesh.material)
    ? tileMesh.material
    : [tileMesh.material];
  const index = geometry.index;

  if (!Array.isArray(tileMesh.material) || !geometry.groups?.length || !index) {
    const exportMesh = tileMesh.clone(true);
    while (exportMesh.children.length > 0) {
      exportMesh.remove(exportMesh.children[0]);
    }
    exportMesh.position.set(0, 0, 0);
    exportMesh.rotation.set(0, 0, 0);
    exportMesh.scale.set(1, 1, 1);
    const mat = materials[0]?.clone?.() ?? materials[0];
    if (mat) {
      mat.opacity = 1;
      mat.transparent = false;
      mat.needsUpdate = true;
      exportMesh.material = mat;
    }
    exportMesh.updateMatrixWorld(true);
    return exportMesh;
  }

  const group = new THREE.Group();
  const position = geometry.attributes.position;

  for (const grp of geometry.groups) {
    const material = materials[grp.materialIndex];
    if (!material) continue;

    const vertexMap = new Map();
    const positions = [];
    const indices = [];

    for (let i = grp.start; i < grp.start + grp.count; i += 1) {
      const sourceIndex = index.getX(i);
      let targetIndex = vertexMap.get(sourceIndex);
      if (targetIndex === undefined) {
        targetIndex = vertexMap.size;
        vertexMap.set(sourceIndex, targetIndex);
        positions.push(
          position.getX(sourceIndex),
          position.getY(sourceIndex),
          position.getZ(sourceIndex),
        );
      }
      indices.push(targetIndex);
    }

    const faceGeometry = new THREE.BufferGeometry();
    faceGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    faceGeometry.setIndex(indices);

    const faceMaterial = material.clone();
    faceMaterial.opacity = 1;
    faceMaterial.transparent = false;
    faceMaterial.needsUpdate = true;

    const faceMesh = new THREE.Mesh(faceGeometry, faceMaterial);
    group.add(faceMesh);
  }

  group.scale.copy(tileMesh.scale);
  group.updateMatrixWorld(true);
  return group;
}

/**
 * Exporteert de keramische tegel-mesh als GLB (WebGL/3D) en start een browserdownload.
 * Decoratieve kinderen (gloed, barst, scherven) worden weggelaten.
 */
export async function downloadTileAsGlb(
  tileMesh,
  filename = "mijn-tegeltje.glb",
) {
  if (!tileMesh?.isMesh) return false;

  const exportRoot = buildTileExportObject(tileMesh);

  const exporter = new GLTFExporter();
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(exportRoot, resolve, reject, { binary: true });
  });

  const blob = new Blob([glb], { type: "model/gltf-binary" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
