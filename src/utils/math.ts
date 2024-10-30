import { Box2, Vector2 } from 'three'

export const findBoundingBox = (
  point: Vector2,
  points: Vector2[],
  bounds: Box2,
) => {
  const { min, max } = bounds.clone()

  for (const p of points) {
    min.x = p.x < point.x ? Math.max(p.x, min.x) : min.x
    min.y = p.y < point.y ? Math.max(p.y, min.y) : min.y
    max.x = p.x > point.x ? Math.min(p.x, max.x) : max.x
    max.y = p.y > point.y ? Math.min(p.y, max.y) : max.y
  }

  const bbox = new Box2(min, max)
  return bbox
}
