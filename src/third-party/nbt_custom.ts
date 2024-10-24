/**
 * Customized and refactored code originating from
 *
 * NBT.js - a JavaScript parser for NBT archives
 * by Sijmen Mulder
 *
 */

// var zlib = typeof require !== 'undefined' ? require('zlib') : window.zlib;

function hasGzipHeader(data: any) {
  const head = new Uint8Array(data.slice(0, 2))
  return head.length === 2 && head[0] === 0x1f && head[1] === 0x8b
}

function decodeUTF8(array: any[]) {
  const codepoints = []
  let i
  for (i = 0; i < array.length; i++) {
    if ((array[i] & 0x80) === 0) {
      codepoints.push(array[i] & 0x7f)
    } else if (
      i + 1 < array.length &&
      (array[i] & 0xe0) === 0xc0 &&
      (array[i + 1] & 0xc0) === 0x80
    ) {
      codepoints.push(((array[i] & 0x1f) << 6) | (array[i + 1] & 0x3f))
    } else if (
      i + 2 < array.length &&
      (array[i] & 0xf0) === 0xe0 &&
      (array[i + 1] & 0xc0) === 0x80 &&
      (array[i + 2] & 0xc0) === 0x80
    ) {
      codepoints.push(
        ((array[i] & 0x0f) << 12) |
          ((array[i + 1] & 0x3f) << 6) |
          (array[i + 2] & 0x3f),
      )
    } else if (
      i + 3 < array.length &&
      (array[i] & 0xf8) === 0xf0 &&
      (array[i + 1] & 0xc0) === 0x80 &&
      (array[i + 2] & 0xc0) === 0x80 &&
      (array[i + 3] & 0xc0) === 0x80
    ) {
      codepoints.push(
        ((array[i] & 0x07) << 18) |
          ((array[i + 1] & 0x3f) << 12) |
          ((array[i + 2] & 0x3f) << 6) |
          (array[i + 3] & 0x3f),
      )
    }
  }
  return String.fromCharCode.apply(null, codepoints)
}

function sliceUint8Array(array: Uint8Array, begin: number, end: number) {
  if ('slice' in array) {
    return array.slice(begin, end)
  } else {
    return new Uint8Array([].slice.call(array, begin, end))
  }
}

/**
 * A mapping from enum to NBT type numbers.
 *
 * @type Object<string, number>
 * @see module:nbt.tagTypeNames
 */
enum DataType {
  END,
  BYTE,
  SHORT,
  INT,
  LONG,
  FLOAT,
  DOUBLE,
  BYTE_ARRAY,
  STRING,
  LIST,
  COMPOUND,
  INT_ARRAY,
  LONG_ARRAY,
}

const DataTypeNames: Record<DataType, string> = {
  [DataType.END]: 'end',
  [DataType.BYTE]: 'byte',
  [DataType.SHORT]: 'short',
  [DataType.INT]: 'int',
  [DataType.LONG]: 'long',
  [DataType.FLOAT]: 'float',
  [DataType.DOUBLE]: 'double',
  [DataType.BYTE_ARRAY]: 'byteArray',
  [DataType.STRING]: 'string',
  [DataType.LIST]: 'list',
  [DataType.COMPOUND]: 'compound',
  [DataType.INT_ARRAY]: 'intArray',
  [DataType.LONG_ARRAY]: 'longArray',
}

/**
 * A mapping from NBT type numbers to type names.
 *
 * @type Object<number, string>
 * @see module:nbt.tagTypes
 **/
const DataTypeMapping: Partial<Record<DataType, string>> = {
  [DataType.BYTE]: 'Int8',
  [DataType.SHORT]: 'Int16',
  [DataType.INT]: 'Int32',
  [DataType.FLOAT]: 'Float32',
  [DataType.DOUBLE]: 'Float64',
}

const DataSizeMapping: Partial<Record<DataType, number>> = {
  [DataType.BYTE]: 1,
  [DataType.SHORT]: 2,
  [DataType.INT]: 4,
  [DataType.FLOAT]: 4,
  [DataType.DOUBLE]: 8,
}

export class NBTReader {
  offset = 0
  arrayView
  dataView
  dataTypeHandler: Record<DataType, () => any> = {
    [DataType.END]: function (): void {
      throw new Error('Function not implemented.')
    },
    [DataType.BYTE]: () => {
      return this.read(DataType.BYTE)
    },
    [DataType.SHORT]: () => {
      return this.read(DataType.SHORT)
    },
    [DataType.INT]: () => {
      return this.read(DataType.INT)
    },
    [DataType.FLOAT]: () => {
      return this.read(DataType.FLOAT)
    },
    [DataType.DOUBLE]: () => {
      return this.read(DataType.DOUBLE)
    },
    [DataType.LONG]: () => {
      return [this.read(DataType.INT), this.read(DataType.INT)]
    },
    [DataType.BYTE_ARRAY]: () => {
      const length = this.read(DataType.INT)
      const bytes = []
      for (let i = 0; i < length; i++) {
        bytes.push(this.read(DataType.BYTE))
      }
      return bytes
    },
    [DataType.STRING]: () => {
      const length = this.read(DataType.SHORT)
      const slice = sliceUint8Array(
        this.arrayView,
        this.offset,
        this.offset + length,
      )
      this.offset += length
      return decodeUTF8(slice as any)
    },
    [DataType.LIST]: () => {
      const type = this.read(DataType.BYTE) as DataType
      const length = this.read(DataType.INT)
      const values = []
      for (let i = 0; i < length; i++) {
        values.push(this.dataTypeHandler[type]())
      }
      return { type: DataTypeMapping[type], value: values }
    },
    [DataType.COMPOUND]: () => {
      const values: any = {}
      while (true) {
        const type = this.read(DataType.BYTE) as DataType
        if (type === DataType.END) {
          break
        }
        const name = this.dataTypeHandler[DataType.STRING]()
        const value = this.dataTypeHandler[type]()
        values[name] = { type: DataTypeNames[type], value }
      }
      return values
    },
    [DataType.INT_ARRAY]: () => {
      const length = this.read(DataType.INT)
      const ints = []
      for (let i = 0; i < length; i++) {
        ints.push(this.read(DataType.INT))
      }
      return ints
    },
    [DataType.LONG_ARRAY]: () => {
      const length = this.read(DataType.INT)
      const longs = []
      for (let i = 0; i < length; i++) {
        longs.push(this.read(DataType.LONG))
      }
      return longs
    },
  }

  constructor(buffer: Iterable<number>) {
    // this.buffer = buffer
    this.arrayView = new Uint8Array(buffer)
    this.dataView = new DataView(this.arrayView.buffer)
  }

  read(dataType: DataType) {
    const dataSize = DataSizeMapping[dataType] || 0
    const callee = 'get' + DataTypeMapping[dataType]
    const val =
      dataType !== DataType.END
        ? (this.dataView as any)[callee](this.offset)
        : ''
    this.offset += dataSize
    return val
  }

  /**
   * @param {ArrayBuffer|Buffer} data - an uncompressed NBT archive
   * @returns {{name: string, value: Object.<string, Object>}}
   *     a named compound
   *
   * @see module:nbt.parse
   * @see module:nbt.writeUncompressed
   *
   * @example
   * nbt.readUncompressed(buf);
   * // -> { name: 'My Level',
   * //      value: { foo: { type: int, value: 42 },
   * //               bar: { type: string, value: 'Hi!' }}} */
  static parseUncompressed(data: Iterable<number>) {
    if (!data) {
      throw new Error('Argument "data" is falsy')
    }

    const reader = new NBTReader(data)

    // var type = reader.byte();
    const type = reader.dataTypeHandler[DataType.BYTE]()
    if (type !== DataType.COMPOUND) {
      throw new Error('Top tag should be a compound')
    }

    return {
      name: reader.dataTypeHandler[DataType.STRING](),
      value: reader.dataTypeHandler[DataType.COMPOUND](),
    }
  }

  /**
   * @callback parseCallback
   * @param {Object} error
   * @param {Object} result - a named compound
   * @param {string} result.name - the top-level name
   * @param {Object} result.value - the top-level compound */

  /**
   * This accepts both gzipped and uncompressd NBT archives.
   * If the archive is uncompressed, the callback will be
   * called directly from this method. For gzipped files, the
   * callback is async.
   *
   * For use in the browser, window.zlib must be defined to decode
   * compressed archives. It will be passed a Buffer if the type is
   * available, or an Uint8Array otherwise.
   *
   * @param {ArrayBuffer|Buffer} data - gzipped or uncompressed data
   * @param {parseCallback} callback
   *
   * @see module:nbt.parseUncompressed
   * @see module:nbt.Reader#compound
   *
   * @example
   * nbt.parse(buf, function(error, results) {
   *     if (error) {
   *         throw error;
   *     }
   *     console.log(result.name);
   *     console.log(result.value.foo);
   * }); */
  static parse(data: any, callback: any) {
    if (!hasGzipHeader(data)) {
      callback(null, NBTReader.parseUncompressed(data))
    } else {
      callback(
        new Error('NBT compressed archive support is not implemented '),
        null,
      )
    }
  }
}
