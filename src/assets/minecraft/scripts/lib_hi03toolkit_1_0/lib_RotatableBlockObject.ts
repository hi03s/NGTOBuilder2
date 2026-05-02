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
    constructor(
        public rotatableBlockSetList: RotatableBlockSet[]
    ) { }

    /**
     * ブロックの位置をオフセットする
     * @param offsetX 
     * @param offsetY 
     * @param offsetZ 
     * @returns オフセットされたRotatableBlockObject
     */
    offset(offsetX: number, offsetY: number, offsetZ: number): RotatableBlockObject {
        const newBlockSetList: RotatableBlockSet[] = [];
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            const newRotatableBlockSet = new RotatableBlockSet(
                rotatableBlockSet.blockSet,
                rotatableBlockSet.local_x + offsetX,
                rotatableBlockSet.local_y + offsetY,
                rotatableBlockSet.local_z + offsetZ
            );
            newRotatableBlockSet.setRotationCenterPos(rotatableBlockSet.axis_x, rotatableBlockSet.axis_y, rotatableBlockSet.axis_z);
            newBlockSetList.push(newRotatableBlockSet);
        }
        return new RotatableBlockObject(newBlockSetList);
    }

    /**
     * ブロックを回転させる
     * @param posX 
     * @param posY 
     * @param posZ 
     * @param quaternionOrYaw クォータニオン または Y軸周りの回転(度)
     * @param pitch X軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @param roll Z軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @returns 
     */
    rotate(posX: number, posY: number, posZ: number, quaternionOrYaw: number | Quaternion, pitch: number, roll: number): RotatedBlockData[] {
        const result: RotatedBlockData[] = [];
        const yaw = quaternionOrYaw instanceof Quaternion ? quaternionOrYaw.extractYaw() : quaternionOrYaw;
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            const rotatedPos = rotatableBlockSet.getRotatedPos(posX, posY, posZ, quaternionOrYaw, pitch, roll);
            const blockState = rotatableBlockSet.blockSet;
            const block = blockState.block;
            const blockId = rotatableBlockSet.blockId;
            let metadata = rotatableBlockSet.metadata;
            //一部のブロックは向きをメタデータから変える
            let isChangeMetaData = false;
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
            }
            result.push([rotatedPos[0], rotatedPos[1], rotatedPos[2], blockState, blockId, metadata]);
        }
        return result;
    }

    /**
     * NGTOから回転可能なブロックのオブジェクトを作成する
     * @param ngto 
     * @param isPlaceAirBlock 空気ブロックも含むかどうか
     * @returns 
     */
    static createFromNGTO(ngto: NGTObject, isPlaceAirBlock: boolean): RotatableBlockObject {
        const blockSetList = [];
        const centerX = ngto.xSize / 2;
        const centerZ = ngto.zSize / 2;
        for (let yIdx = 0; yIdx < ngto.ySize; yIdx++) {
            for (let xIdx = 0; xIdx < ngto.xSize; xIdx++) {
                for (let zIdx = 0; zIdx < ngto.zSize; zIdx++) {
                    const blockSet = ngto.getBlockSet(xIdx, yIdx, zIdx);
                    if (isPlaceAirBlock || Block.getIdFromBlock(blockSet.block) !== 0) {
                        const rotatableBlockSet = new RotatableBlockSet(blockSet, xIdx, yIdx, zIdx);
                        rotatableBlockSet.setRotationCenterPos(centerX, 0, centerZ);
                        blockSetList.push(rotatableBlockSet);
                    }
                }
            }
        }
        return new RotatableBlockObject(blockSetList);
    }

    /**
     * Z軸方向にスライスされたNGTO(XY平面)からRotatableBlockObjectを作成する
     * @param ngto 
     * @param isPlaceAirBlock 空気ブロックも含むかどうか
     * @param zIndex スライスするNGTOのZ座標(0 ～ ngto.zSize-1)
     * @returns 
     */
    createSliceAtZFromNGTO(ngto: NGTObject, isPlaceAirBlock: boolean, zIndex: number): RotatableBlockObject {
        zIndex = ((zIndex % ngto.zSize) + ngto.zSize) % ngto.zSize;
        const blockSetList = [];
        const centerX = ngto.xSize / 2;
        const centerY = ngto.ySize / 2;
        for (let xIdx = 0; xIdx < ngto.xSize; xIdx++) {
            for (let yIdx = 0; yIdx < ngto.ySize; yIdx++) {
                const blockSet = ngto.getBlockSet(xIdx, yIdx, zIndex);
                if (isPlaceAirBlock || Block.getIdFromBlock(blockSet.block) !== 0) {
                    const rotatableBlockSet = new RotatableBlockSet(blockSet, xIdx, yIdx, 0);
                    rotatableBlockSet.setRotationCenterPos(centerX, centerY, 0);
                    blockSetList.push(rotatableBlockSet);
                }
            }
        }
        return new RotatableBlockObject(blockSetList);
    }

    /**
     * X軸方向にスライスされたNGTO(YZ平面)からRotatableBlockObjectを作成する
     * @param ngto 
     * @param isPlaceAirBlock 空気ブロックも含むかどうか
     * @param xIndex スライスするNGTOのX座標(0 ～ ngto.xSize-1)
     * @returns 
     */
    createSliceAtXFromNGTO(ngto: NGTObject, isPlaceAirBlock: boolean, xIndex: number): RotatableBlockObject {
        xIndex = ((xIndex % ngto.xSize) + ngto.xSize) % ngto.xSize;
        const blockSetList = [];
        const centerY = ngto.ySize / 2;
        const centerZ = ngto.zSize / 2;
        for (let yIdx = 0; yIdx < ngto.ySize; yIdx++) {
            for (let zIdx = 0; zIdx < ngto.zSize; zIdx++) {
                const blockSet = ngto.getBlockSet(xIndex, yIdx, zIdx);
                if (isPlaceAirBlock || Block.getIdFromBlock(blockSet.block) !== 0) {
                    const rotatableBlockSet = new RotatableBlockSet(blockSet, 0, yIdx, zIdx);
                    rotatableBlockSet.setRotationCenterPos(0, centerY, centerZ);
                    blockSetList.push(rotatableBlockSet);
                }
            }
        }
        return new RotatableBlockObject(blockSetList);
    }

    /**
     * Y軸方向にスライスされたNGTO(XZ平面)からRotatableBlockObjectを作成する
     * @param ngto 
     * @param isPlaceAirBlock 空気ブロックも含むかどうか
     * @param yIndex スライスするNGTOのY座標(0 ～ ngto.ySize-1)
     * @returns 
     */
    createSliceAtYFromNGTO(ngto: NGTObject, isPlaceAirBlock: boolean, yIndex: number): RotatableBlockObject {
        yIndex = ((yIndex % ngto.ySize) + ngto.ySize) % ngto.ySize;
        const blockSetList = [];
        const centerX = ngto.xSize / 2;
        const centerZ = ngto.zSize / 2;
        for (let xIdx = 0; xIdx < ngto.xSize; xIdx++) {
            for (let zIdx = 0; zIdx < ngto.zSize; zIdx++) {
                const blockSet = ngto.getBlockSet(xIdx, yIndex, zIdx);
                if (isPlaceAirBlock || Block.getIdFromBlock(blockSet.block) !== 0) {
                    const rotatableBlockSet = new RotatableBlockSet(blockSet, xIdx, 0, zIdx);
                    rotatableBlockSet.setRotationCenterPos(centerX, 0, centerZ);
                    blockSetList.push(rotatableBlockSet);
                }
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
     * 回転軸を中心に回転させた後、指定した座標を原点とするワールド座標に変換して取得する
     * @param posX 
     * @param posY 
     * @param posZ 
     * @param quaternionOrYaw クォータニオン または Y軸周りの回転(度)
     * @param pitch X軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @param roll Z軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @returns 回転後の座標
     */
    getRotatedPos(posX: number, posY: number, posZ: number, quaternionOrYaw: number | Quaternion, pitch: number, roll: number): Pos {
        var quat;
        if (quaternionOrYaw instanceof Quaternion) {
            quat = quaternionOrYaw;
        } else {
            // yaw, pitch, rollから初期回転を含めたクォータニオンを作成
            var initialQuat = Quaternion.fromEuler(0, 0, 90);
            var rotationQuat = Quaternion.fromEuler(quaternionOrYaw, pitch, roll);
            quat = rotationQuat.multiply(initialQuat);
        }
        var vec = new Vec3(this.local_x - this.axis_x, this.local_y - this.axis_y, this.local_z - this.axis_z);
        vec = quat.rotateVector(vec);
        return [
            posX + vec.getX(),
            posY + vec.getY(),
            posZ + vec.getZ()
        ];
    }
}