import { createNoise2D } from 'simplex-noise'
import alea from 'alea'

function create_fractional_brownian(seed, biome) {
  const { scale, height, octaves, persistence, lacunarity, exponentiation } =
    biome

  // Create a single noise function and pass different seeds for each octave.
  const noise = createNoise2D(alea(seed))

  return (x, z) => {
    let total = 0
    let amplitude = 1.0
    let frequency = 1.0
    let maxAmplitude = 0

    for (let o = 0; o < octaves; o++) {
      const noiseValue =
        (noise((x / scale) * frequency, (z / scale) * frequency) + 1) / 2
      total += noiseValue * amplitude
      maxAmplitude += amplitude
      amplitude *= persistence
      frequency *= lacunarity
    }

    // Normalizing the total value to make sure it's between 0 and 1.
    total = total / maxAmplitude

    // Apply exponentiation for non-linear scaling.
    total = Math.pow(total, exponentiation)

    // Scale the normalized value to the desired height range.
    total *= height / 100

    // Clamping the final value to ensure it doesn't exceed 1.
    return Math.min(Math.max(total, 0), 1)
  }
}

export const Noises = seed => ({
  continentalness: create_fractional_brownian(seed, {
    scale: 1000, // Larger scale for broad features
    height: 10, // Larger height for more pronounced continental features
    octaves: 2, // Fewer octaves may make the noise smoother at a large scale
    persistence: 0.6, // Slightly more persistence for smoother transitions
    lacunarity: 0.25, // Higher lacunarity for more complex continental shapes
    exponentiation: 0.9, // Slight exponentiation for softer transitions
  }),
  erosion: create_fractional_brownian(seed, {
    scale: 300, // Medium scale for erosion features
    height: 30, // Less height for subtler erosion effects
    octaves: 1, // Fewer octaves for smoother erosion patterns
    persistence: 0.5, // Standard persistence for medium detail
    lacunarity: 0.2, // Standard lacunarity for a moderate level of detail
    exponentiation: 1, // Standard exponentiation for natural-looking erosion
  }),
  peaks_valleys: create_fractional_brownian(seed, {
    scale: 150, // Smaller scale for detailed features
    height: 50, // Height for pronounced peaks and deep valleys
    octaves: 2, // More octaves for detailed noise
    persistence: 0.45, // Slightly less persistence for sharper features
    lacunarity: 0.22, // Slightly higher lacunarity for more detailed ruggedness
    exponentiation: 1.5, // Higher exponentiation for sharper peaks and valleys
  }),
})
