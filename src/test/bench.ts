import { Vector3, Box3 } from 'three'

// import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ITER_MODE, VoxelMap } from '../procgen/VoxelMap'
import { WorldGenerator } from '../procgen/WorldGen'

const worldGen = (voxelMap, bbox) => {
  const octree = voxelMap.voxelsOctree
  const timestamp = Date.now()
  const worldGen = new WorldGenerator(noiseScale)
  worldGen.fill(octree, bbox)
  const elapsedTime = Date.now() - timestamp
  const itemsCount = voxelMap.voxelsOctree.countPoints()
  const itemsPerMs = Math.round(itemsCount / elapsedTime)
  console.log(
    `[BENCH::GEN] ${elapsedTime}ms to generate ${itemsCount} voxels: ${itemsPerMs} items per ms `,
  )
}

const iterVoxels = (voxelMap, iterMode) => {
  const timestamp = Date.now()
  const tweaks = { iterMode }
  const iter = voxelMap.iterateOnVoxels(bmin, bmax, tweaks)
  let iterCount = 1
  let res = iter.next()
  while (!res.done) {
    res = iter.next()
    iterCount++
  }
  const elapsedTime = Date.now() - timestamp
  const itemsPerMs = Math.round(iterCount / elapsedTime)
  console.log(
    `[BENCH::ITER] mode ${iterMode} ${elapsedTime}ms to iterate over ${iterCount} voxels: ${itemsPerMs} items per ms `,
  )
}

const noiseScale = 1 / 8 // 1 unit of noise per N voxels
const bmin = new Vector3(0, 0, 0)
const bmax = new Vector3(256, 130, 256)
const bbox = new Box3(bmin, bmax)
const voxelMap = new VoxelMap(bbox)
worldGen(voxelMap, bbox);
iterVoxels(voxelMap, ITER_MODE.OPTIM1);
iterVoxels(voxelMap, ITER_MODE.OPTIM2);
iterVoxels(voxelMap, ITER_MODE.SKIP_NEIGHBOURS);
console.log('DONE')
