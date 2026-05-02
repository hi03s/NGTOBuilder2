import { Vec3 } from "jp.ngt.ngtlib.math";

//###  Quaternion  ###
/**
 *  クォータニオンを扱うオブジェクト
 */
export class Quaternion {
    constructor(
        public w: number = 1,
        public x: number = 0,
        public y: number = 0,
        public z: number = 0
    ) { }

    /**
     * クォータニオンを正規化する
     */
    normalize(): Quaternion {
        const length = Math.sqrt(this.w * this.w + this.x * this.x + this.y * this.y + this.z * this.z);
        if (length === 0) return new Quaternion(1, 0, 0, 0);
        return new Quaternion(this.w / length, this.x / length, this.y / length, this.z / length);
    }

    /**
     * クォータニオン同士を掛ける
     */
    multiply(q: Quaternion): Quaternion {
        const w = this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z;
        const x = this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y;
        const y = this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x;
        const z = this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w;
        return new Quaternion(w, x, y, z);
    }

    /**
     * クォータニオンの共役を求める
     */
    conjugate(): Quaternion {
        return new Quaternion(this.w, -this.x, -this.y, -this.z);
    }

    /**
     * クォータニオンでベクトルを回転させる(座標回転向け)
     * @param vec 
     * @returns 回転後のベクトル
     */
    rotateVector(vec: Vec3): Vec3 {
        var qVec = new Quaternion(0, vec.getX(), vec.getY(), vec.getZ());
        var qConj = this.conjugate();
        var result = this.multiply(qVec).multiply(qConj);
        return new Vec3(result.x, result.y, result.z);
    }

    /**
     * クォータニオンからYaw角を抽出する(度数)
     * @returns Yaw角(度)
     */
    extractYaw(): number {
        const yaw = Math.atan2(2 * (this.w * this.z + this.x * this.y), 1 - 2 * (this.y * this.y + this.z * this.z));
        return yaw * 180 / Math.PI;
    }

    /**
     * Euler角(yaw, pitch, roll)からクォータニオンを作成する
     * @param  yaw Y軸周りの回転(度)
     * @param  pitch X軸周りの回転(度)
     * @param  roll Z軸周りの回転(度)
     * @returns 合成されたクォータニオン
     */
    static fromEuler(yaw: number, pitch: number, roll: number): Quaternion {
        // 度数法をラジアンに変換
        const yawRad = yaw * Math.PI / 180;
        const pitchRad = pitch * Math.PI / 180;
        const rollRad = roll * Math.PI / 180;

        const cy = Math.cos(yawRad * 0.5);
        const sy = Math.sin(yawRad * 0.5);
        const cp = Math.cos(pitchRad * 0.5);
        const sp = Math.sin(pitchRad * 0.5);
        const cr = Math.cos(rollRad * 0.5);
        const sr = Math.sin(rollRad * 0.5);

        const w = cr * cp * cy + sr * sp * sy;
        const x = sr * cp * cy - cr * sp * sy;
        const y = cr * sp * cy + sr * cp * sy;
        const z = cr * cp * sy - sr * sp * cy;

        return new Quaternion(w, x, y, z).normalize();
    }
}