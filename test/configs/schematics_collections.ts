/**
 *
 * Sorting in different collections based on
 * - which biome item belongs
 * - which landscape (e.g. noise level or elevation range) item can spawn
 * - used distribution profile: according to item size,
 *
 * Landscape collection examples:
 * bocage normand, forêts champenoise, garrigue méditérannéene
 *
 */

/**
 * Temperate flora set
 */

const temperate_forest = {
    small: {
        Acer_pseudoplatanus1: 1,
        Corylus_avellana1: 1,
        Malus_sylvestris1: 1,
        Quercus_robur1: 1,
    },
    medium: {
        'trees_eu/Aesculus_hippocastanum1': 1,
        'trees_eu/Fraxinus_excelsior1': 1,
        'trees_eu/Populus_tremula1': 1, // tall tree
        'trees_eu/Pinus_sylvestris1': 1,
        'trees_eu/Juglans_regia1': 1,
    },
    tall: {
        'trees_eu/Fagus_sylvatica1': 1,
    },
}

/**
 * Alpine flora set
 */

const alpine = {
    small: {
        'trees_eu/Alnus_glutinosa1': 1,
        'trees_eu/Pinus_mugo1': 1,
        'trees_eu/Populus_nigra1': 1,
    },
    medium: {
        'trees_eu/Betula_pubescens1': 1,
        'trees_eu/Larix_decidua1': 1,
        'trees_eu/Picea_abies1': 1,
        'trees_eu/Picea_omorika1': 1,
    },
    tall: {
        'trees_eu/Pinus_cembra1': 1,
    },
}

/**
 * Siberian flora set
 */

const siberian = {
    small: {},
    medium: {
        'trees_eu/Picea_omorika1': 1,
        'trees_eu/Pinus_sylvestris1': 3,
    },
    tall: {
        'trees_eu/Populus_tremula1': 1,
    },
}

/**
 * Mediterranean flora set
 */

const mediterannean = {
    small: {
        'trees_eu/Laurus_nobilis1': 1,
        'trees_eu/Olea_europaea1': 1,
        'trees_eu/Prunus_amygdalus1': 1,
        'trees_eu/Quercus_coccifera1': 1,
    },
    medium: {
        'trees_eu/Ceratonia_siliqua1': 1,
        'trees_eu/Cupressus_sempervirens1': 1,
        'trees_eu/Pinus_nigra1': 1,
        'trees_eu/Pinus_pinea1': 1,
    },
    tall: {
        'trees_eu/Cedrus_libani1': 1,
    },
}

/**
 * Distribution collections
 */

export const SCHEMATICS_COLLECTIONS = {
    temperate_forest,
    alpine,
    mediterannean,
    siberian,
}
