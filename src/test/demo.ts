import { AresRpgEngine } from '@aresrpg/aresrpg-engine'
import * as THREE from 'three'
import { Vector3, Box3 } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { VoxelMap } from '../procgen/VoxelMap'
import { WorldGenerator } from '../procgen/WorldGen'

const renderer = new THREE.WebGLRenderer()
document.body.appendChild(renderer.domElement)
renderer.setClearColor(0x000000)

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
)
const udpateRendererSize = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', udpateRendererSize)
udpateRendererSize()

const scene = new THREE.Scene()
const noiseScale = 1 / 8 // 1 unit of noise per N voxels
const bmin = new Vector3(0, 0, 0)
const bmax = new Vector3(256, 130, 256)
const bbox = new Box3(bmin, bmax)
const voxelMap = new VoxelMap(bbox)
const worldGen = new WorldGenerator(noiseScale)
worldGen.fill(voxelMap.voxelsOctree, bbox)
const terrain = new AresRpgEngine.Terrain(voxelMap)
scene.add(terrain.container)

scene.add(new THREE.AxesHelper(500))

camera.position.set(-50, 100, -50)
const cameraControl = new OrbitControls(camera, renderer.domElement)
cameraControl.target.set(voxelMap.size.x / 2, 0, voxelMap.size.z / 2)

terrain.showEntireMap()
function render(): void {
  cameraControl.update()
  terrain.updateUniforms()
  renderer.render(scene, camera)
  requestAnimationFrame(render)
}
requestAnimationFrame(render)
