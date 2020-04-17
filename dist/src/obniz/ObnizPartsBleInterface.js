"use strict";
/**
 * @packageDocumentation
 * @module ObnizCore
 */
Object.defineProperty(exports, "__esModule", { value: true });
class ObnizPartsBleInterface {
    constructor() {
        /**
         * Internally Used function for connection required devices
         */
        this._peripheral = null;
    }
    /**
     * Utility function for reading 2 byte to signed number.
     */
    static signed16FromBinary(high, low) {
        let val = (high << 8) | low;
        if ((val & 0x8000) !== 0) {
            val = val - 0x10000;
        }
        return val;
    }
}
exports.default = ObnizPartsBleInterface;

//# sourceMappingURL=ObnizPartsBleInterface.js.map
