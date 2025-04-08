import { blocksProcessingTests } from './blocks.test.js'
import { chunksProcessingTests } from './chunks.test.js'
// import { itemsProcessingTests } from "./items.test.js"

const run_tests = async () => {
    console.log('non-regression tests: START')
    await chunksProcessingTests()
    await blocksProcessingTests()
    // DISABLED until schematics blob loading is supported
    // await itemsProcessingTests()
    console.log('non-regression tests: DONE')
}

run_tests()
