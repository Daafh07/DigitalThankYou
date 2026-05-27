import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const EXPORT_VERTEX_ATTRS = ["position", "normal", "uv"];

function cloneMaterialForExport(material) {
  if (!material) return null;
  const mat = material.clone();
  mat.opacity = 1;
  mat.transparent = false;
  mat.depthWrite = true;
  mat.needsUpdate = true;
  return mat;
}

/**
 * Haalt een deel van een geïndexeerde BufferGeometry op (één material group).
 * Kopieert alle relevante vertex-attributen zodat texturen in GLB kloppen.
 */
function extractIndexedGroupGeometry(geometry, group) {
  const index = geometry.index;
  const position = geometry.attributes.position;
  if (!index || !position) return null;

  const vertexMap = new Map();
  const attrArrays = Object.fromEntries(
    EXPORT_VERTEX_ATTRS.filter((name) => geometry.attributes[name]).map(
      (name) => [name, []],
    ),
  );
  const indices = [];

  for (let i = group.start; i < group.start + group.count; i += 1) {
    const sourceIndex = index.getX(i);
    let targetIndex = vertexMap.get(sourceIndex);
    if (targetIndex === undefined) {
      targetIndex = vertexMap.size;
      vertexMap.set(sourceIndex, targetIndex);
      for (const name of Object.keys(attrArrays)) {
        const attr = geometry.attributes[name];
        const itemSize = attr.itemSize;
        for (let c = 0; c < itemSize; c += 1) {
          attrArrays[name].push(attr.array[sourceIndex * itemSize + c]);
        }
      }
    }
    indices.push(targetIndex);
  }

  const faceGeometry = new THREE.BufferGeometry();
  for (const [name, values] of Object.entries(attrArrays)) {
    const itemSize = geometry.attributes[name].itemSize;
    faceGeometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(values, itemSize),
    );
  }
  faceGeometry.setIndex(indices);
  return faceGeometry;
}

/**
 * Bouwt een exporteerbaar object van een (multi-material) tegel-mesh.
 * GLTFExporter ondersteunt geen material-array op één mesh in Three r174.
 */
function buildTileExportObject(tileMesh) {
  tileMesh.updateMatrixWorld(true);
  const worldMatrix = tileMesh.matrixWorld.clone();

  const geometry = tileMesh.geometry;
  const materials = Array.isArray(tileMesh.material)
    ? tileMesh.material
    : [tileMesh.material];

  if (Array.isArray(tileMesh.material) && geometry.groups?.length && geometry.index) {
    const group = new THREE.Group();
    for (const grp of geometry.groups) {
      const material = materials[grp.materialIndex];
      if (!material) continue;

      const faceGeometry = extractIndexedGroupGeometry(geometry, grp);
      if (!faceGeometry) continue;

      faceGeometry.applyMatrix4(worldMatrix);

      const exportMaterial = cloneMaterialForExport(material);
      if (!exportMaterial) continue;

      group.add(new THREE.Mesh(faceGeometry, exportMaterial));
    }
    group.updateMatrixWorld(true);
    return group;
  }

  const exportMesh = tileMesh.clone(true);
  while (exportMesh.children.length > 0) {
    exportMesh.remove(exportMesh.children[0]);
  }
  exportMesh.geometry = exportMesh.geometry.clone();
  exportMesh.geometry.applyMatrix4(worldMatrix);
  exportMesh.position.set(0, 0, 0);
  exportMesh.rotation.set(0, 0, 0);
  exportMesh.scale.set(1, 1, 1);
  const mat = cloneMaterialForExport(materials[0]);
  if (mat) exportMesh.material = mat;
  exportMesh.updateMatrixWorld(true);
  return exportMesh;
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
