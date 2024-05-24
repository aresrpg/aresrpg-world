import { BlocksPatch } from "../procgen/BlocksPatch"

/**
 * To be made available from dev console with
 * window.devHacks = DevHacks.singleton
 */
export class DevHacks {
    static singleton: DevHacks
    static get instance() {
        this.singleton = this.singleton || new DevHacks()
        return this.singleton
    }
    dumpPatchCache(){
        console.log(BlocksPatch.cache)
    }
}