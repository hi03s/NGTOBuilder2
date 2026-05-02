import { BlockSet, NGTObject } from "jp.ngt.ngtlib.block";
import { Vec3 } from "jp.ngt.ngtlib.math";
import { Block, BlockButton, BlockDoor, BlockFenceGate, BlockLadder, BlockLog, BlockStairs } from "net.minecraft.block";
import { Quaternion } from "./lib_Quaternion";

export type RotatedBlockData = [
    x: number,
    y: number,
    z: number,
    blockState: BlockSet,
    blockId: number,
    metadata: number
];

export type Pos = [
    x: number,
    y: number,
    z: number
]

//### RotatableBlockObject ###
/**
 * 回転可能なブロックのオブジェクト
 */
export class RotatableBlockObject {

    public additionalBlocks: RotatableBlockSet[] = [];

    constructor(
        public rotatableBlockSetList: RotatableBlockSet[],
    ) { }

    /**
     * ブロックの位置をオフセットする
     * @param offsetX 
     * @param offsetY 
     * @param offsetZ 
     * @returns オフセットされた新しいRotatableBlockObject
     */
    offset(offsetX: number, offsetY: number, offsetZ: number): RotatableBlockObject {
        const newBlockSetList: RotatableBlockSet[] = [];
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            const newRotatableBlockSet = new RotatableBlockSet(
                rotatableBlockSet.blockSet,
                rotatableBlockSet.local_x + offsetX,
                rotatableBlockSet.local_y + offsetY,
                rotatableBlockSet.local_z + offsetZ,
            );
            newRotatableBlockSet.setRotationCenterPos(rotatableBlockSet.axis_x, rotatableBlockSet.axis_y, rotatableBlockSet.axis_z);
            newBlockSetList.push(newRotatableBlockSet);
        }
        return new RotatableBlockObject(newBlockSetList);
    }

    /**
     * RotatableBlockObjectをコピーする
     * @returns コピーされた新しいRotatableBlockObject
     */
    copy(): RotatableBlockObject {
        const newBlockSetList: RotatableBlockSet[] = [];
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            const newRotatableBlockSet = new RotatableBlockSet(
                rotatableBlockSet.blockSet,
                rotatableBlockSet.local_x,
                rotatableBlockSet.local_y,
                rotatableBlockSet.local_z
            );
            newRotatableBlockSet.setRotationCenterPos(rotatableBlockSet.axis_x, rotatableBlockSet.axis_y, rotatableBlockSet.axis_z);
            newBlockSetList.push(newRotatableBlockSet);
        }
        return new RotatableBlockObject(newBlockSetList);
    }

    /**
     * 回転の中心点を設定する(ローカル座標)
     * @param axis_x ローカル回転軸座標
     * @param axis_y ローカル回転軸座標
     * @param axis_z ローカル回転軸座標
     */
    setRotationAxisPos(axis_x: number, axis_y: number, axis_z: number): void {
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            rotatableBlockSet.setRotationCenterPos(axis_x, axis_y, axis_z);
        }
    }

    /**
     * ブロックを回転する(ローカル座標)
     * @param mode 補間モード 0:補間なし 1:座標拡散
     * @param quaternionOrYaw クォータニオン または Y軸周りの回転(度)
     * @param pitch X軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @param roll Z軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @returns 補間モードがONの時の追加ブロック
     */
    rotate(mode: number, quaternionOrYaw: number | Quaternion, pitch?: number, roll?: number): void {
        const yaw = quaternionOrYaw instanceof Quaternion ? quaternionOrYaw.extractYaw() : quaternionOrYaw;
        this.additionalBlocks = [];//最後のrotateの補間だけ追加する
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            const rotatedPos = rotatableBlockSet.getRotated(quaternionOrYaw, pitch, roll);
            if (mode === 0) {//補間なし
                rotatableBlockSet.local_x = rotatedPos[0];
                rotatableBlockSet.local_y = rotatedPos[1];
                rotatableBlockSet.local_z = rotatedPos[2];
            }
            if (mode === 1) {//座標拡散 角方向へオフセットした座標を追加する
                rotatableBlockSet.local_x = rotatedPos[0];
                rotatableBlockSet.local_y = rotatedPos[1];
                rotatableBlockSet.local_z = rotatedPos[2];
                const offset = 0.25;
                this.additionalBlocks.push(rotatableBlockSet.copy(-offset, -offset, -offset));
                this.additionalBlocks.push(rotatableBlockSet.copy(+offset, -offset, -offset));
                this.additionalBlocks.push(rotatableBlockSet.copy(-offset, -offset, +offset));
                this.additionalBlocks.push(rotatableBlockSet.copy(+offset, -offset, +offset));
                this.additionalBlocks.push(rotatableBlockSet.copy(-offset, +offset, -offset));
                this.additionalBlocks.push(rotatableBlockSet.copy(+offset, +offset, -offset));
                this.additionalBlocks.push(rotatableBlockSet.copy(-offset, +offset, +offset));
                rotatableBlockSet.local_x += offset;
                rotatableBlockSet.local_y += offset;
                rotatableBlockSet.local_z += offset;
            }
            //一部のブロックは向きをメタデータから変える
            let metadata = rotatableBlockSet.metadata;
            let isChangeMetaData = false;
            const block = rotatableBlockSet.blockSet.block;
            const instanceList = [BlockStairs, BlockDoor, BlockFenceGate, BlockLog, BlockLadder, BlockButton];
            for (let instanceIdx = 0; instanceIdx < instanceList.length; instanceIdx++) {
                if (block instanceof instanceList[instanceIdx]) {
                    isChangeMetaData = true;
                    break;
                }
            }
            if (isChangeMetaData) {
                let directions = [0, 3, 2, 1];//[南,東,北,西]
                if (block instanceof BlockStairs) directions = [0, 3, 1, 2];//階段はメタデータの構造が違うため
                if (block instanceof BlockLog) directions = [];//原木もメタデータの構造が違う
                if (block instanceof BlockLadder) directions = [2, 4, 3, 5];//はしご
                if (block instanceof BlockButton) directions = [2, 3, 1, 4];//ボタン
                let blockDir = metadata & 3;//2bitで方角管理
                const option1 = metadata & 4;//3bitめを取得
                const option2 = metadata & 8;//4bitめを取得
                const currentDirIndex = directions.indexOf(blockDir);
                let rotateIndex = 0;
                if (45 <= yaw && yaw < 135) rotateIndex = 1;
                if (135 <= yaw && yaw < 225) rotateIndex = 2;
                if (225 <= yaw && yaw < 315) rotateIndex = 3;
                if (currentDirIndex !== -1) {
                    const newDirIndex = (currentDirIndex + rotateIndex) % directions.length;
                    blockDir = directions[newDirIndex];
                }
                metadata = option2 | option1 | blockDir;//新しいメタデータ
                if (block instanceof BlockLog) {//原木は3/4bit入れ替えで向きを変える
                    if (rotateIndex === 1 || rotateIndex === 3) {
                        metadata = metadata ^ 4;
                        metadata = metadata ^ 8;
                    }
                }
                rotatableBlockSet.metadata = metadata;
            }
        }
    }

    toBlockPos(): void {
        const posKeyList = [];
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            rotatableBlockSet.local_x = Math.round(rotatableBlockSet.local_x);
            rotatableBlockSet.local_y = Math.floor(rotatableBlockSet.local_y);//なぜかfloorだとうまくいく
            rotatableBlockSet.local_z = Math.round(rotatableBlockSet.local_z);
            const posKey = `${rotatableBlockSet.local_x}_${rotatableBlockSet.local_y}_${rotatableBlockSet.local_z}`;
            posKeyList.push(posKey);
        }
        //補間ブロックの処理
        for (let i = 0; i < this.additionalBlocks.length; i++) {
            const additionalBlockSet = this.additionalBlocks[i];
            additionalBlockSet.local_x = Math.round(additionalBlockSet.local_x);
            additionalBlockSet.local_y = Math.floor(additionalBlockSet.local_y);//なぜかfloorだとうまくいく
            additionalBlockSet.local_z = Math.round(additionalBlockSet.local_z);
            const posKey = `${additionalBlockSet.local_x}_${additionalBlockSet.local_y}_${additionalBlockSet.local_z}`;
            if (posKeyList.indexOf(posKey) === -1){
                //座標が被っていなければ追加
                this.rotatableBlockSetList.push(additionalBlockSet);
            }
        }
    }

    /**
     * ブロックの中から空気ブロックを削除する
     * @returns
     */
    removeAirBlock(): void {
        for (let i = this.rotatableBlockSetList.length - 1; i >= 0; i--) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            if (rotatableBlockSet.blockSet.block.getMaterial().isReplaceable()) {
                this.rotatableBlockSetList.splice(i, 1);
            }
        }
    }

    /**
     * 
     * @param placeX ワールド座標
     * @param placeY ワールド座標
     * @param placeZ ワールド座標
     * @returns 
     */
    getPlacePosList(placeX: number, placeY: number, placeZ: number): Pos[] {
        const result: Pos[] = [];
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            result.push([rotatableBlockSet.local_x + placeX, rotatableBlockSet.local_y + placeY, rotatableBlockSet.local_z + placeZ]);
        }
        return result;
    }

    /**
     * NGTOから回転可能なブロックのオブジェクトを作成する
     * @param ngto 
     * @returns 
     */
    static createFromNGTO(ngto: NGTObject): RotatableBlockObject {
        const blockSetList = [];
        for (let yIdx = 0; yIdx < ngto.ySize; yIdx++) {
            for (let xIdx = 0; xIdx < ngto.xSize; xIdx++) {
                for (let zIdx = 0; zIdx < ngto.zSize; zIdx++) {
                    const blockSet = ngto.getBlockSet(xIdx, yIdx, zIdx);
                    const rotatableBlockSet = new RotatableBlockSet(blockSet, xIdx, yIdx, zIdx);
                    blockSetList.push(rotatableBlockSet);
                }
            }
        }
        return new RotatableBlockObject(blockSetList);
    }

    /**
     * Z軸方向にスライスされたNGTO(XY平面)からRotatableBlockObjectを作成する
     * @param ngto 
     * @param zIndex スライスするNGTOのZ座標(0 ～ ngto.zSize-1)
     * @returns 
     */
    static createSliceAtZFromNGTO(ngto: NGTObject, zIndex: number): RotatableBlockObject {
        zIndex = ((zIndex % ngto.zSize) + ngto.zSize) % ngto.zSize;
        const blockSetList = [];
        for (let xIdx = 0; xIdx < ngto.xSize; xIdx++) {
            for (let yIdx = 0; yIdx < ngto.ySize; yIdx++) {
                const blockSet = ngto.getBlockSet(xIdx, yIdx, zIndex);
                const rotatableBlockSet = new RotatableBlockSet(blockSet, xIdx, yIdx, 0);
                blockSetList.push(rotatableBlockSet);
            }
        }
        return new RotatableBlockObject(blockSetList);
    }

    /**
     * X軸方向にスライスされたNGTO(YZ平面)からRotatableBlockObjectを作成する
     * @param ngto 
     * @param xIndex スライスするNGTOのX座標(0 ～ ngto.xSize-1)
     * @returns 
     */
    static createSliceAtXFromNGTO(ngto: NGTObject, xIndex: number): RotatableBlockObject {
        xIndex = ((xIndex % ngto.xSize) + ngto.xSize) % ngto.xSize;
        const blockSetList = [];
        for (let yIdx = 0; yIdx < ngto.ySize; yIdx++) {
            for (let zIdx = 0; zIdx < ngto.zSize; zIdx++) {
                const blockSet = ngto.getBlockSet(xIndex, yIdx, zIdx);
                const rotatableBlockSet = new RotatableBlockSet(blockSet, 0, yIdx, zIdx);
                blockSetList.push(rotatableBlockSet);
            }
        }
        return new RotatableBlockObject(blockSetList);
    }

    /**
     * Y軸方向にスライスされたNGTO(XZ平面)からRotatableBlockObjectを作成する
     * @param ngto 
     * @param yIndex スライスするNGTOのY座標(0 ～ ngto.ySize-1)
     * @returns 
     */
    static createSliceAtYFromNGTO(ngto: NGTObject, yIndex: number): RotatableBlockObject {
        yIndex = ((yIndex % ngto.ySize) + ngto.ySize) % ngto.ySize;
        const blockSetList = [];
        for (let xIdx = 0; xIdx < ngto.xSize; xIdx++) {
            for (let zIdx = 0; zIdx < ngto.zSize; zIdx++) {
                const blockSet = ngto.getBlockSet(xIdx, yIndex, zIdx);
                const rotatableBlockSet = new RotatableBlockSet(blockSet, xIdx, 0, zIdx);
                blockSetList.push(rotatableBlockSet);
            }
        }
        return new RotatableBlockObject(blockSetList);
    }
}

//###  RotatableBlockSet  ###
export class RotatableBlockSet {
    blockSet: BlockSet;
    blockId: number;
    metadata: number;
    local_x: number;
    local_y: number;
    local_z: number;
    axis_x: number;
    axis_y: number;
    axis_z: number;

    constructor(blockSet: BlockSet, localX: number, localY: number, localZ: number) {
        this.blockSet = blockSet;
        this.blockId = Block.getIdFromBlock(blockSet.block);
        this.metadata = blockSet.metadata;
        this.local_x = Math.floor(localX) + 0.5;
        this.local_y = Math.floor(localY) + 0.5;
        this.local_z = Math.floor(localZ) + 0.5;
        this.axis_x = 0;
        this.axis_y = 0;
        this.axis_z = 0;
    }

    copy(offsetX?: number, offsetY?: number, offsetZ?: number,): RotatableBlockSet {
        const newBS = new RotatableBlockSet(this.blockSet, 0, 0, 0);
        newBS.local_x = this.local_x + Number(offsetX);
        newBS.local_y = this.local_y + Number(offsetY);
        newBS.local_z = this.local_z + Number(offsetZ);
        newBS.axis_x = this.axis_x;
        newBS.axis_y = this.axis_y;
        newBS.axis_z = this.axis_z;
        return newBS;
    }

    /**
     * 回転の中心点を設定する
     * @param x 
     * @param y 
     * @param z 
     */
    setRotationCenterPos(x: number, y: number, z: number): void {
        this.axis_x = x;
        this.axis_y = y;
        this.axis_z = z;
    }

    /**
     * 回転軸を中心に回転させた後の座標を取得する(ローカル座標)
     * @param quaternionOrYaw クォータニオン または Y軸周りの回転(度)
     * @param pitch X軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @param roll Z軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @returns 
     */
    getRotated(quaternionOrYaw: number | Quaternion, pitch?: number, roll?: number): Pos {
        let quat;
        if (quaternionOrYaw instanceof Quaternion) {
            quat = quaternionOrYaw;
        } else if (pitch !== undefined && roll !== undefined) {
            // yaw, pitch, rollから初期回転を含めたクォータニオンを作成
            const initialQuat = Quaternion.fromEuler(0, 0, 90);
            const rotationQuat = Quaternion.fromEuler(quaternionOrYaw, pitch, roll);
            quat = rotationQuat.multiply(initialQuat);
        }
        else quat = new Quaternion();
        let vec = new Vec3(this.local_x - this.axis_x, this.local_y - this.axis_y, this.local_z - this.axis_z);
        vec = quat.rotateVector(vec);
        return [
            vec.getX(),
            vec.getY(),
            vec.getZ()
        ];
    }

    /**
     * 回転軸を中心に回転させた後、指定した座標を原点とするワールド座標に変換して取得する
     * @param posX ワールド座標
     * @param posY ワールド座標
     * @param posZ ワールド座標
     * @param quaternionOrYaw クォータニオン または Y軸周りの回転(度)
     * @param pitch X軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @param roll Z軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @returns 回転後の座標
     */
    getRotatedPos(posX: number, posY: number, posZ: number, quaternionOrYaw: number | Quaternion, pitch: number, roll: number): Pos {
        const rotated = this.getRotated(quaternionOrYaw, pitch, roll);
        return [
            Math.floor(posX + rotated[0]),
            Math.floor(posY + rotated[1]),
            Math.floor(posZ + rotated[2])
        ];
    }
}