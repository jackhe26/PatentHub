/**
 * DOMMatrix polyfill for pdf-parse
 * This must be the first code executed in the main process
 * (Must be imported before any other modules that use pdf-parse)
 */

// DOMMatrix polyfill - provides minimal DOMMatrix implementation for Node.js
if (typeof globalThis.DOMMatrix === 'undefined') {
  // @ts-ignore
  var DOMMatrix = function (input?: string) {
    this.a = 1
    this.b = 0
    this.c = 0
    this.d = 1
    this.e = 0
    this.f = 0
    this.m11 = 1
    this.m12 = 0
    this.m13 = 0
    this.m14 = 0
    this.m21 = 0
    this.m22 = 1
    this.m23 = 0
    this.m24 = 0
    this.m31 = 0
    this.m32 = 0
    this.m33 = 1
    this.m34 = 0
    this.m41 = 0
    this.m42 = 0
    this.m43 = 0
    this.m44 = 1
    if (input && typeof input === 'string') {
      var match = input.match(/matrix\(([^)]+)\)/)
      if (match) {
        var values = match[1].split(',').map(Number)
        if (values.length === 6) {
          this.a = values[0]
          this.b = values[1]
          this.c = values[2]
          this.d = values[3]
          this.e = values[4]
          this.f = values[5]
          this.m11 = values[0]
          this.m12 = values[1]
          this.m21 = values[2]
          this.m22 = values[3]
          this.m41 = values[4]
          this.m42 = values[5]
        }
      }
    }
  }
  DOMMatrix.prototype.multiply = function () {
    return new DOMMatrix()
  }
  DOMMatrix.prototype.translate = function () {
    return new DOMMatrix()
  }
  DOMMatrix.prototype.scale = function () {
    return new DOMMatrix()
  }
  DOMMatrix.prototype.rotate = function () {
    return new DOMMatrix()
  }
  DOMMatrix.prototype.flipX = function () {
    return new DOMMatrix()
  }
  DOMMatrix.prototype.flipY = function () {
    return new DOMMatrix()
  }
  DOMMatrix.prototype.inverse = function () {
    return new DOMMatrix()
  }
  DOMMatrix.prototype.toString = function () {
    return (
      'matrix(' +
      this.a +
      ', ' +
      this.b +
      ', ' +
      this.c +
      ', ' +
      this.d +
      ', ' +
      this.e +
      ', ' +
      this.f +
      ')'
    )
  }
  // @ts-ignore
  globalThis.DOMMatrix = DOMMatrix
  // Also set global for legacy code that uses global
  // @ts-ignore
  if (typeof global !== 'undefined') {
    // @ts-ignore
    global.global = globalThis
  }
}
