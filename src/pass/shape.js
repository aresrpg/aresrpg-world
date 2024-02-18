const MIN_HEIGHT = 0
const MAX_HEIGHT = 255

function lerp(start, end, factor) {
  return start * (1 - factor) + end * factor
}

// Finds the two key points in the spline that the given value is between.
function find_key_points(value, key_points) {
  let [lower_key_point] = key_points
  let upper_key_point = key_points[key_points.length - 1]

  for (let i = 0; i < key_points.length - 1; i++) {
    if (value >= key_points[i].value && value < key_points[i + 1].value) {
      lower_key_point = key_points[i]
      upper_key_point = key_points[i + 1]
      break
    }
  }

  return { lower_key_point, upper_key_point }
}

// Interpolates the spline based on the given value and the array of key points.
function interpolate_spline(value, key_points) {
  const { lower_key_point, upper_key_point } = find_key_points(
    value,
    key_points,
  )

  const factor =
    (value - lower_key_point.value) /
    (upper_key_point.value - lower_key_point.value)

  return (
    lerp(lower_key_point.height, upper_key_point.height, factor) *
    (MAX_HEIGHT - MIN_HEIGHT + MIN_HEIGHT)
  )
}

const splines = {
  continentalness: [
    // Deep ocean to beach transition
    { value: 0, height: 0 }, // Deep ocean
    { value: 0.1, height: 0.02 }, // Ocean surface
    { value: 0.12, height: 0.03 }, // Start of beach
    { value: 0.14, height: 0.1 }, // End of beach

    // Beach to flatland transition
    { value: 0.2, height: 0.12 }, // Lowland

    // Flatland to rolling hills transition
    { value: 0.4, height: 0.3 }, // Rolling hills

    // Hills to mountain transition
    { value: 0.6, height: 0.5 }, // Foothills
    { value: 0.7, height: 0.7 }, // Lower mountain
    { value: 0.9, height: 0.9 }, // Mid mountain

    // High mountain peak
    { value: 1.0, height: 1 }, // High mountain
  ],
  erosion: [
    // No erosion to strong erosion for creating canyons
    { value: 0, height: 0 }, // No erosion
    { value: 0.3, height: 0.05 }, // Mild erosion
    { value: 0.6, height: 0.2 }, // Moderate erosion, potential canyon formation
    { value: 0.8, height: 0.5 }, // Severe erosion, deep canyons
    { value: 1.0, height: 0.8 }, // Extremely eroded terrain, very deep canyons
  ],
  peaks_valleys: [
    // Valleys to sharp peaks transition
    { value: 0, height: 0 }, // Flat valleys
    { value: 0.3, height: 0.1 }, // Gentle peaks and valleys
    { value: 0.5, height: 0.3 }, // More pronounced peaks
    { value: 0.7, height: 0.6 }, // High peaks
    { value: 0.9, height: 0.9 }, // Very sharp and rugged peaks
    { value: 1.0, height: 1 }, // Extremely sharp peaks
  ],
}

export function shape_height({ continentalness, erosion, peaks_valleys }) {
  return (x, z) => {
    const continent_base = continentalness(x, z)
    const erosion_base = erosion(x, z)
    const peaks_valleys_base = peaks_valleys(x, z)

    const continent_factor = 10
    const erosion_factor = 7
    const peaks_valleys_factor = 3

    const continent_height =
      interpolate_spline(continent_base, splines.continentalness) *
      continent_factor

    // Apply erosion, which will generally lower the height based on the erosion noise.
    const erosion_height =
      interpolate_spline(erosion_base, splines.erosion) * erosion_factor

    // Apply peaks & valleys, which might raise or lower the height based on the local details.
    const peak_height =
      interpolate_spline(peaks_valleys_base, splines.peaks_valleys) *
      peaks_valleys_factor

    return continent_height - erosion_height + peak_height
  }
}
