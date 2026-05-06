import * as THREE from 'three';

export function createCeramicMaterial({ highlight = 0, blue = '#104f91' } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f4f1e8').lerp(new THREE.Color('#fffaf0'), highlight),
    roughness: 0.24,
    metalness: 0,
    clearcoat: 0.78,
    clearcoatRoughness: 0.19,
    reflectivity: 0.76,
    sheen: 0.25,
    sheenColor: new THREE.Color(blue),
  });
}

export function createBlueInkMaterial({ opacity = 1 } = {}) {
  return new THREE.MeshStandardMaterial({
    color: '#0a4f91',
    roughness: 0.38,
    metalness: 0,
    transparent: opacity < 1,
    opacity,
  });
}

export function createGoldLightMaterial({ opacity = 1 } = {}) {
  return new THREE.MeshBasicMaterial({
    color: '#d5a84d',
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}
