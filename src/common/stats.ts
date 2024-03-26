export class Stats {
  // eslint-disable-next-line no-use-before-define
  static singleton: Stats
  static get instance() {
    Stats.singleton = Stats.singleton || new Stats()
    return Stats.singleton
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
}
