/**
 * @packageDocumentation
 *
 * @ignore
 */

import EventEmitter from "eventemitter3";

import { BleDeviceAddress, BleDeviceAddressType } from "../../bleTypes";
import AclStream from "./acl-stream";
import crypto from "./crypto";

/**
 * @ignore
 */
namespace SMP {
  export const CID = 0x0006;
  export const PAIRING_REQUEST = 0x01;
  export const PAIRING_RESPONSE = 0x02;
  export const PAIRING_CONFIRM = 0x03;
  export const PAIRING_RANDOM = 0x04;
  export const PAIRING_FAILED = 0x05;
  export const ENCRYPT_INFO = 0x06;
  export const MASTER_IDENT = 0x07;
  export const SMP_SECURITY_REQUEST = 0x0b;
}

/**
 * @ignore
 */
type SmpEventTypes = "masterIdent" | "ltk" | "fail" | "end";

/**
 * @ignore
 */
export interface SmpEncryptOptions {
  /**
   * Stored pairing keys
   */
  keys?: string;

  /**
   * Callback function that call on pairing passkey required.
   */
  passkeyCallback?: () => Promise<number>;
}

/**
 * @ignore
 */
class Smp extends EventEmitter<SmpEventTypes> {
  private _aclStream: AclStream;
  private _iat: any;
  private _ia: any;
  private _rat: any;
  private _ra: any;
  private onAclStreamDataBinded: any;
  private onAclStreamEndBinded: any;
  private _preq: any;
  private _pres: any;
  private _tk: any;
  private _r: any;
  private _pcnf: any;
  private _stk: any = null;
  private _ltk: any = null;
  private _options?: SmpEncryptOptions = undefined;

  constructor(
    aclStream: AclStream,
    localAddressType: BleDeviceAddressType,
    localAddress: BleDeviceAddress,
    remoteAddressType: BleDeviceAddressType,
    remoteAddress: BleDeviceAddress,
  ) {
    super();
    this._aclStream = aclStream;

    this._iat = Buffer.from([localAddressType === "random" ? 0x01 : 0x00]);
    this._ia = Buffer.from(
      localAddress
        .split(":")
        .reverse()
        .join(""),
      "hex",
    );
    this._rat = Buffer.from([remoteAddressType === "random" ? 0x01 : 0x00]);
    this._ra = Buffer.from(
      remoteAddress
        .split(":")
        .reverse()
        .join(""),
      "hex",
    );

    this.onAclStreamDataBinded = this.onAclStreamData.bind(this);
    this.onAclStreamEndBinded = this.onAclStreamEnd.bind(this);

    this._aclStream.on("data", this.onAclStreamDataBinded);
    this._aclStream.on("end", this.onAclStreamEndBinded);
  }

  public async pairingWithKeyWait(key: string) {
    this.setKeys(key);
    const encResult = await this._aclStream.onSmpStkWait(this._stk);
    return encResult;
  }

  public async pairingWait(options?: SmpEncryptOptions) {
    this._options = options;
    if (this._options && this._options.keys) {
      // console.warn("skip pairing");
      return await this.pairingWithKeyWait(this._options.keys);
    }

    await this.sendPairingRequestWait();
    const pairingResponse = await this._aclStream.readWait(SMP.CID, SMP.PAIRING_RESPONSE);
    this.handlePairingResponse(pairingResponse);
    const confirm = await this._aclStream.readWait(SMP.CID, SMP.PAIRING_CONFIRM, 60 * 1000); // 60sec timeout
    this.handlePairingConfirm(confirm);
    const random = await this._aclStream.readWait(SMP.CID, SMP.PAIRING_RANDOM);
    const encResult = this.handlePairingRandomWait(random);

    const encInfoPromise = this._aclStream.readWait(SMP.CID, SMP.ENCRYPT_INFO);
    const masterIdentPromise = this._aclStream.readWait(SMP.CID, SMP.MASTER_IDENT);
    await Promise.all([encInfoPromise, masterIdentPromise]);
    const encInfo = await encInfoPromise;
    const masterIdent = await masterIdentPromise;
    this.handleEncryptInfo(encInfo);
    this.handleMasterIdent(masterIdent);

    return encResult;
  }

  public onAclStreamData(cid: any, data?: any) {
    if (cid !== SMP.CID) {
      return;
    }

    const code: any = data.readUInt8(0);

    // console.warn("SMP: " + code);
    return;
    if (SMP.PAIRING_RESPONSE === code) {
      this.handlePairingResponse(data);
    } else if (SMP.PAIRING_CONFIRM === code) {
      this.handlePairingConfirm(data);
    } else if (SMP.PAIRING_RANDOM === code) {
      this.handlePairingRandomWait(data);
    } else if (SMP.PAIRING_FAILED === code) {
      this.handlePairingFailed(data);
    } else if (SMP.ENCRYPT_INFO === code) {
      this.handleEncryptInfo(data);
    } else if (SMP.MASTER_IDENT === code) {
      this.handleMasterIdent(data);
    } else if (SMP.SMP_SECURITY_REQUEST === code) {
      this.handleSecurityRequest(data);
    } else {
      throw new Error();
    }
  }

  public onAclStreamEnd() {
    this._aclStream.removeListener("data", this.onAclStreamDataBinded);
    this._aclStream.removeListener("end", this.onAclStreamEndBinded);

    this.emit("end");
  }

  public async handlePairingResponse(data: any) {
    this._pres = data;

    if (this.isPasskeyMode()) {
      let passkeyNumber = 0;
      try {
        passkeyNumber = await this._options!.passkeyCallback!();
      } catch {}
      const passkey = new Array(16);
      for (let i = 0; i < 3; i++) {
        passkey[i] = (passkeyNumber >> (i * 8)) & 0xff;
      }

      this._tk = Buffer.from(passkey);
    } else {
      this._tk = Buffer.from("00000000000000000000000000000000", "hex");
    }

    this._r = crypto.r();

    this.write(
      Buffer.concat([
        Buffer.from([SMP.PAIRING_CONFIRM]),
        crypto.c1(this._tk, this._r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra),
      ]),
    );
  }

  public handlePairingConfirm(data: any) {
    this._pcnf = data;

    this.write(Buffer.concat([Buffer.from([SMP.PAIRING_RANDOM]), this._r]));
  }

  public async handlePairingRandomWait(data: any) {
    const r: any = data.slice(1);
    let encResult = null;
    const pcnf: any = Buffer.concat([
      Buffer.from([SMP.PAIRING_CONFIRM]),
      crypto.c1(this._tk, r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra),
    ]);

    if (this._pcnf.toString("hex") === pcnf.toString("hex")) {
      if (this._stk !== null) {
        console.error("second stk");
      }
      this._stk = crypto.s1(this._tk, r, this._r);

      // this.emit("stk", this._stk);
      encResult = await this._aclStream.onSmpStkWait(this._stk);
    } else {
      this.write(Buffer.from([SMP.PAIRING_RANDOM, SMP.PAIRING_CONFIRM]));

      this.emit("fail");
      throw new Error("Encryption pcnf error");
    }
    return encResult;
  }

  public handlePairingFailed(data: any) {
    this.emit("fail");
  }

  public handleEncryptInfo(data: any) {
    this._ltk = data.slice(1);
    this.emit("ltk", this._ltk);
  }

  public handleMasterIdent(data: any) {
    const ediv: any = data.slice(1, 3);
    const rand: any = data.slice(3);

    this.emit("masterIdent", ediv, rand);
  }

  public write(data: any) {
    this._aclStream.write(SMP.CID, data);
  }

  public handleSecurityRequest(data: any) {
    this.pairingWait();
  }

  public setKeys(keyStringBase64: string) {
    const keyString = Buffer.from(keyStringBase64, "base64").toString("ascii");
    const keys = JSON.parse(keyString);
    this._stk = Buffer.from(keys.stk);
    this._preq = Buffer.from(keys.preq);
    this._pres = Buffer.from(keys.pres);
    this._tk = Buffer.from(keys.tk);
    this._r = Buffer.from(keys.r);
    this._pcnf = Buffer.from(keys.pcnf);
    this._ltk = Buffer.from(keys.ltk);
  }

  public getKeys() {
    const keys = {
      stk: this._stk.toString("hex"),
      preq: this._preq.toString("hex"),
      pres: this._pres.toString("hex"),
      tk: this._tk.toString("hex"),
      r: this._r.toString("hex"),
      pcnf: this._pcnf.toString("hex"),
      ltk: this._ltk.toString("hex"),
    };
    const jsonString = JSON.stringify(keys);
    const keyString = Buffer.from(jsonString, "ascii").toString("base64");
    return keyString;
  }

  private async sendPairingRequestWait() {
    if (this.isPasskeyMode()) {
      this._preq = Buffer.from([
        SMP.PAIRING_REQUEST,
        0x02, // IO capability: Keyboard
        0x00, // OOB data: Authentication data not present
        0x05, // Authentication requirement: Bonding - MITM
        0x10, // Max encryption key size
        0x00, // Initiator key distribution: <none>
        0x01, // Responder key distribution: EncKey
      ]);
    } else {
      this._preq = Buffer.from([
        SMP.PAIRING_REQUEST,
        0x03, // IO capability: NoInputNoOutput
        0x00, // OOB data: Authentication data not present
        0x01, // Authentication requirement: Bonding - No MITM
        0x10, // Max encryption key size
        0x00, // Initiator key distribution: <none>
        0x01, // Responder key distribution: EncKey
      ]);
    }
    this.write(this._preq);
  }

  private isPasskeyMode() {
    if (this._options && this._options.passkeyCallback) {
      return true;
    }
    return false;
  }
}

export default Smp;
