import { ProcItemCategory, ProcItemType } from "../../src/tools/ProceduralGenerators"

export const proc_items = {
    AppleTree_S: 'appletree_s',
    PineTree_S: 'pinetre_s',
    AppleTree_M: 'appletree_m',
    PineTree_M: 'pinetre_m',
}

const tree_sizes_conf = {
    small: {
        treeSize: 6,
        treeRadius: 3,
    },
    medium: {
        treeSize: 4,
        treeRadius: 4,
    },
}

export const PROC_ITEMS_CONFIG = {
    [proc_items.AppleTree_S]: {
        category: ProcItemCategory.Tree,
        params: {
            treeType: ProcItemType.AppleTree,
            ...tree_sizes_conf.small,
        },
    },
    [proc_items.PineTree_S]: {
        category: ProcItemCategory.Tree,
        params: {
            treeType: ProcItemType.PineTree,
            ...tree_sizes_conf.small,
        },
    },
    [proc_items.AppleTree_M]: {
        category: ProcItemCategory.Tree,
        params: {
            treeType: ProcItemType.AppleTree,
            ...tree_sizes_conf.medium,
        },
    },
    [proc_items.PineTree_M]: {
        category: ProcItemCategory.Tree,
        params: {
            treeType: ProcItemType.PineTree,
            ...tree_sizes_conf.medium,
        },
    },
}
