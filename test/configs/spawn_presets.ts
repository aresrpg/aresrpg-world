import { SpawnCategory, SpawnPresets, SpawnProfiles } from "../../src/utils/common_types"

// can add more profile here
enum SpawnProfile {
    Default = 'default',
    Low = 'low',
    High = 'high',
    Strict = 'strict',
}

// can override defaults settings here
export const spawn_profiles: SpawnProfiles = {
    [SpawnProfile.Default]: {
        overlapTolerance: 0.5,
        overlapProbability: 0.5
    },
    [SpawnProfile.Low]: {
        overlapTolerance: 0.2,
        overlapProbability: 0.2
    },
    [SpawnProfile.High]: {
        overlapTolerance: 0.4,
        overlapProbability: 0.8
    },
    [SpawnProfile.Strict]: {
        overlapTolerance: 0,
        overlapProbability: 0
    }
}

export const spawn_presets: SpawnPresets = {
    'mstructures/mce-desertpyramid': {
        spawnProfile: SpawnProfile.Low,
        spawnCategory: SpawnCategory.Structure
    }
}