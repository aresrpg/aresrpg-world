// schematics_files.js
const schematic_files_index = import.meta.glob(
  '/src/.discarded/showcase/assets/schematics/trees_europe/*.schem*',
  {
    eager: true,
    import: 'default',
    query: '?url',
  },
)

export const SCHEMATICS_FILES_INDEX = Object.fromEntries(
  Object.entries(schematic_files_index).map(([path, url]) => {
    // Extract the path before '.schem'
    const match = path.match(/(.+)\.schem/)
    const relative_path = match ? match[1] : path
    return [relative_path, url]
  }),
)
