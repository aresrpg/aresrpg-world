/**
 * Handling stats reporting
 */
export class ProcGenStatsReporting {
  // eslint-disable-next-line no-use-before-define
  static singleton: ProcGenStatsReporting
  static get instance() {
    ProcGenStatsReporting.singleton = ProcGenStatsReporting.singleton || new ProcGenStatsReporting()
    // put in global scope for access from dev console
    // window.aresrpg = {}
    // window.aresrpg.procgen = {}
    // window.aresrpg.procgen.stats = ProcGenStatsReporting.singleton.stats
    return ProcGenStatsReporting.singleton
  }

  stats: any = {
    noiseRange: {
      min: 1,
      max: 0,
      anomalies: 0,
    },
    adjacentCount: {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
    },
    worldGen: {
      time: 0,
      blocks: 0,
      iterations: 0,
    },
  }

  /**
   * silently report noise anomalies
   * @param noiseVal
   */
  noiseAnomaly(noiseVal: number) {
    const { noiseRange } = this.stats
    noiseRange.min = noiseVal < noiseRange.min ? noiseVal : noiseRange.min
    noiseRange.max = noiseVal > noiseRange.max ? noiseVal : noiseRange.max
    noiseRange.anomalies++
  }

  adjacentNeighboursCount(adjCount: number) {
    const { adjacentCount } = this.stats
    adjacentCount[adjCount]++
  }

  get worldGen() {
    return this.stats.worldGen
  }

  set worldGen(stats) {
    this.stats.worldGen.time += stats.time || 0
    this.stats.worldGen.blocks += stats.blocks || 0
    this.stats.worldGen.iterations += stats.iterations || 0
  }
}
