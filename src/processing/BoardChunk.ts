export class BoardChunk extends ChunkContainer {
    boardParams: BoardParams = {
      center: new Vector3(),
      radius: 0,
      thickness: 0,
    }
  
    override encodeSectorData(sectorData: number): number {
      
    }
  
    isWithinBoard(buffPos: Vector2, buffer: Uint16Array) {
      const { radius, center } = this.boardParams
      if (buffPos) {
        const lastBlock = buffer[buffer.length - 2]
        // const isFull = buffer.slice(1, -1).find(val => val === 0) === undefined
        const centerDist = buffPos.distanceTo(asVect2(center))
        const isInside = centerDist <= radius && lastBlock === 0
        return isInside
      }
      // isInsideBoard && this.boardBounds.expandByPoint(asVect2(blockPos))
      return false
    }
  
    overrideHeightBuffer = (heightBuff: Uint16Array, isHoleBlock: boolean) => {
      const { thickness: boardThickness } = this.boardParams
      // const marginBlockType = isHoleBlock ? BlockType.HOLE : heightBuff[0]
      const surfaceType = heightBuff
        .slice(1, boardThickness + 1)
        .reverse()
        .find(val => !!val)
      const boardHeightBuffer = heightBuff.map((val, i) => {
        // return i <= boardThickness ? val : BlockType.NONE
        if (i > boardThickness) {
          return emptyBlock
        } else {
          let blockType = val
          if (isHoleBlock) {
            blockType = i < boardThickness ? BlockType.HOLE : blockType
          } else {
            blockType = !val ? surfaceType || BlockType.NONE : blockType
          }
  
        }
      })
  
      return boardHeightBuffer
    }
  }