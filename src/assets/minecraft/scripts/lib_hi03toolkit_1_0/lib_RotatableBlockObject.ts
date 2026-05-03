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
    public minX: number = 0;
    public minY: number = 0;
    public minZ: number = 0;
    public maxX: number = 0;
    public maxY: number = 0;
    public maxZ: number = 0;

    constructor(public rotatableBlockSetList: (RotatableBlockSet | undefined)[]) {//回転処理によって欠落が生じる可能性がある

    }

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
            if (!rotatableBlockSet) continue;
            const newRotatableBlockSet = new RotatableBlockSet(
                rotatableBlockSet.blockSet,
                rotatableBlockSet.local_x + offsetX,
                rotatableBlockSet.local_y + offsetY,
                rotatableBlockSet.local_z + offsetZ,
            );
            newRotatableBlockSet.setRotationCenterPos(rotatableBlockSet.axis_x, rotatableBlockSet.axis_y, rotatableBlockSet.axis_z);
            newBlockSetList.push(newRotatableBlockSet);
        }
        this.calcSize();
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
            if (!rotatableBlockSet) continue;
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
            if (!rotatableBlockSet) continue;
            rotatableBlockSet.setRotationCenterPos(axis_x, axis_y, axis_z);
        }
    }

    /**
     * ブロックを回転する(ローカル座標)
     * @param mode 補間モード 0:補間なし 1:座標拡散
     * @param diffusionRate 補間の拡散量[m]
     * @param quaternionOrYaw クォータニオン または Y軸周りの回転(度)
     * @param pitch X軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @param roll Z軸周りの回転(度) - quaternionOrYawがQuaternionの場合は無視
     * @returns 補間モードがONの時の追加ブロック
     */
    rotate(mode: number, diffusionRate: number, quaternionOrYaw: number | Quaternion, pitch?: number, roll?: number): void {
        let yaw = quaternionOrYaw instanceof Quaternion ? quaternionOrYaw.extractYaw() : quaternionOrYaw;
        yaw = (yaw + 360) % 360;
        this.additionalBlocks = [];//最後のrotateの補間だけ追加する
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            if (!rotatableBlockSet) continue;
            const rotatedPos = rotatableBlockSet.getRotated(quaternionOrYaw, pitch, roll);
            if (mode === 0) {//XZ拡散
                const offset = diffusionRate;
                rotatableBlockSet.local_x = rotatedPos[0];
                rotatableBlockSet.local_y = rotatedPos[1];
                rotatableBlockSet.local_z = rotatedPos[2];
                this.additionalBlocks.push(rotatableBlockSet.copy(-offset, 0, -offset));
                this.additionalBlocks.push(rotatableBlockSet.copy(-offset, 0, +offset));
                this.additionalBlocks.push(rotatableBlockSet.copy(+offset, 0, -offset));
                rotatableBlockSet.local_x += offset;
                rotatableBlockSet.local_z += offset;
            }
            if (mode === 1) {//XYZ拡散
                const offset = diffusionRate;
                rotatableBlockSet.local_x = rotatedPos[0];
                rotatableBlockSet.local_y = rotatedPos[1];
                rotatableBlockSet.local_z = rotatedPos[2];
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
            if (mode === 2) {//補間なし
                rotatableBlockSet.local_x = rotatedPos[0];
                rotatableBlockSet.local_y = rotatedPos[1];
                rotatableBlockSet.local_z = rotatedPos[2];
            }
            //一部のブロックは向きをメタデータから変える
            let isChangeMetaData = false;
            const block = rotatableBlockSet.blockSet.block;
            let metadata = rotatableBlockSet.blockSet.metadata;
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
                let blockDir: number;
                let option1 = 0;
                let option2 = 0;
                if (block instanceof BlockLadder) {// はしごは metadata 2〜5 をそのまま方向として使う
                    blockDir = metadata;
                }
                else {// 通常の向き付きブロックは下位2bitを方向として使う
                    blockDir = metadata & 3;
                    option1 = metadata & 4;
                    option2 = metadata & 8;
                }
                const currentDirIndex = directions.indexOf(blockDir);
                let rotateIndex = 0;
                if (45 <= yaw && yaw < 135) rotateIndex = 1;
                if (135 <= yaw && yaw < 225) rotateIndex = 2;
                if (225 <= yaw && yaw < 315) rotateIndex = 3;
                if (currentDirIndex !== -1) {
                    const newDirIndex = (currentDirIndex + rotateIndex) % directions.length;
                    blockDir = directions[newDirIndex];
                }
                metadata = block instanceof BlockLadder ? blockDir : option2 | option1 | blockDir;
                if (block instanceof BlockLog) {//原木は3/4bit入れ替えで向きを変える
                    if (rotateIndex === 1 || rotateIndex === 3) {
                        metadata = metadata ^ 4;
                        metadata = metadata ^ 8;
                    }
                }
                rotatableBlockSet.metadata = metadata;
                if (rotatableBlockSet.blockSet) {
                    const prevNBT = rotatableBlockSet.blockSet.nbt;
                    rotatableBlockSet.blockSet = prevNBT ? new BlockSet(rotatableBlockSet.blockSet.block, metadata, prevNBT) : new BlockSet(rotatableBlockSet.blockSet.block, metadata);
                }
            }
        }
        this.calcSize();
    }

    toBlockPos(): void {
        const xSize = this.maxX - this.minX + 1;
        const ySize = this.maxY - this.minY + 1;
        const zSize = this.maxZ - this.minZ + 1;
        const newBlockList = [];
        //補間ブロックの処理
        for (let i = 0; i < this.additionalBlocks.length; i++) {
            const additionalBlockSet = this.additionalBlocks[i];
            additionalBlockSet.local_x = Math.round(additionalBlockSet.local_x);
            additionalBlockSet.local_y = Math.floor(additionalBlockSet.local_y);//なぜかfloorだとうまくいく
            additionalBlockSet.local_z = Math.round(additionalBlockSet.local_z);
            const indexX = additionalBlockSet.local_x - this.minX;
            const indexY = additionalBlockSet.local_y - this.minY;
            const indexZ = additionalBlockSet.local_z - this.minZ;
            const index = (indexY * xSize + indexX) * zSize + indexZ;
            newBlockList[index] = additionalBlockSet;
        }
        this.additionalBlocks = [];
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rotatableBlockSet = this.rotatableBlockSetList[i];
            if (!rotatableBlockSet) continue;
            rotatableBlockSet.local_x = Math.round(rotatableBlockSet.local_x);
            rotatableBlockSet.local_y = Math.floor(rotatableBlockSet.local_y);//なぜかfloorだとうまくいく
            rotatableBlockSet.local_z = Math.round(rotatableBlockSet.local_z);
            const indexX = rotatableBlockSet.local_x - this.minX;
            const indexY = rotatableBlockSet.local_y - this.minY;
            const indexZ = rotatableBlockSet.local_z - this.minZ;
            const index = (indexY * xSize + indexX) * zSize + indexZ;
            newBlockList[index] = rotatableBlockSet;
        }
        this.rotatableBlockSetList = newBlockList.filter(v => v !== undefined);
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
            if (!rotatableBlockSet) continue;
            result.push([rotatableBlockSet.local_x + placeX, rotatableBlockSet.local_y + placeY, rotatableBlockSet.local_z + placeZ]);
        }
        return result;
    }

    private calcSize() {
        this.rotatableBlockSetList.forEach(rbs => {
            if (rbs) {
                this.minX = Math.round(Math.min(this.minX, rbs.local_x));
                this.minY = Math.floor(Math.min(this.minY, rbs.local_y));
                this.minZ = Math.round(Math.min(this.minZ, rbs.local_z));
                this.maxX = Math.round(Math.max(this.maxX, rbs.local_x));
                this.maxY = Math.floor(Math.max(this.maxY, rbs.local_y));
                this.maxZ = Math.round(Math.max(this.maxZ, rbs.local_z));
            }
        });
    }

    /**
     * X軸について鏡像にする
     * toBlockPos()実行後に使用してください
     */
    mirrorX(): void {
        this.calcSize();
        const centerX = (this.minX + this.maxX) / 2;
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rbs = this.rotatableBlockSetList[i];
            if (!rbs) continue;
            //座標交換
            rbs.local_x = 2 * centerX - rbs.local_x;
            rbs.axis_x = 2 * centerX - rbs.axis_x;
            //メタデータ変換
            let isChangeMetaData = false;
            const block = rbs.blockSet.block;
            const instanceList = [BlockStairs, BlockDoor, BlockFenceGate, BlockLog, BlockLadder, BlockButton];
            for (let instanceIdx = 0; instanceIdx < instanceList.length; instanceIdx++) {
                if (block instanceof instanceList[instanceIdx]) {
                    isChangeMetaData = true;
                    break;
                }
            }
            if (isChangeMetaData) {
                let directions: number[] = [0, 3, 2, 1];
                if (block instanceof BlockStairs) directions = [0, 3, 1, 2];
                if (block instanceof BlockLog) directions = [];
                if (block instanceof BlockLadder) directions = [2, 4, 3, 5];
                if (block instanceof BlockButton) directions = [2, 3, 1, 4];
                let metadata = rbs.blockSet.metadata;
                let blockDir: number;
                let option1 = 0;
                let option2 = 0;
                if (block instanceof BlockLadder) {
                    blockDir = metadata;
                }
                else {
                    blockDir = metadata & 3;
                    option1 = metadata & 4;
                    option2 = metadata & 8;
                }
                const currentDirIndex = directions.indexOf(blockDir);
                if (currentDirIndex !== -1) {
                    let mappedIndex = currentDirIndex;
                    if (block instanceof BlockLadder || block instanceof BlockFenceGate) {
                        if (currentDirIndex === 1) mappedIndex = 3;
                        else if (currentDirIndex === 3) mappedIndex = 1;
                    }
                    else {
                        if (currentDirIndex === 0) mappedIndex = 2;
                        else if (currentDirIndex === 2) mappedIndex = 0;
                    }
                    const newDir = directions[mappedIndex];
                    metadata = block instanceof BlockLadder ? newDir : option2 | option1 | newDir;
                    rbs.metadata = metadata;
                    if (rbs.blockSet) {
                        const prevNBT = rbs.blockSet.nbt;
                        rbs.blockSet = prevNBT ? new BlockSet(rbs.blockSet.block, metadata, prevNBT) : new BlockSet(rbs.blockSet.block, metadata);
                    }
                }
            }
        }
        this.calcSize();
    }

    /**
     * Z軸について鏡像にする（破壊的）
     * toBlockPos()実行後に使用してください
     */
    mirrorZ(): void {
        this.calcSize();
        const centerZ = (this.minZ + this.maxZ) / 2;
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const rbs = this.rotatableBlockSetList[i];
            if (!rbs) continue;
            //座標交換
            rbs.local_z = 2 * centerZ - rbs.local_z;
            rbs.axis_z = 2 * centerZ - rbs.axis_z;
            //メタデータ変換
            let isChangeMetaData = false;
            const block = rbs.blockSet.block;
            const instanceList = [BlockStairs, BlockDoor, BlockFenceGate, BlockLog, BlockLadder, BlockButton];
            for (let instanceIdx = 0; instanceIdx < instanceList.length; instanceIdx++) {
                if (block instanceof instanceList[instanceIdx]) {
                    isChangeMetaData = true;
                    break;
                }
            }
            if (isChangeMetaData) {
                let directions: number[] = [0, 3, 2, 1];
                if (block instanceof BlockStairs) directions = [0, 3, 1, 2];
                if (block instanceof BlockLog) directions = [];
                if (block instanceof BlockLadder) directions = [2, 4, 3, 5];
                if (block instanceof BlockButton) directions = [2, 3, 1, 4];
                let metadata = rbs.blockSet.metadata;
                let blockDir: number;
                let option1 = 0;
                let option2 = 0;
                if (block instanceof BlockLadder) {
                    blockDir = metadata;
                }
                else {
                    blockDir = metadata & 3;
                    option1 = metadata & 4;
                    option2 = metadata & 8;
                }
                const currentDirIndex = directions.indexOf(blockDir);
                if (currentDirIndex !== -1) {
                    let mappedIndex = currentDirIndex;
                    if (block instanceof BlockLadder || block instanceof BlockFenceGate) {
                        if (currentDirIndex === 0) mappedIndex = 2;
                        else if (currentDirIndex === 2) mappedIndex = 0;
                    }
                    else {
                        if (currentDirIndex === 1) mappedIndex = 3;
                        else if (currentDirIndex === 3) mappedIndex = 1;
                    }
                    const newDir = directions[mappedIndex];
                    metadata = block instanceof BlockLadder ? newDir : option2 | option1 | newDir;
                    rbs.metadata = metadata;
                    if (rbs.blockSet) {
                        const prevNBT = rbs.blockSet.nbt;
                        rbs.blockSet = prevNBT ? new BlockSet(rbs.blockSet.block, metadata, prevNBT) : new BlockSet(rbs.blockSet.block, metadata);
                    }
                }
            }
        }
        this.calcSize();
    }

    /**
     * Y軸について鏡像にする（破壊的）
     * toBlockPos()実行後に使用してください
     */
    mirrorY(): void {
        this.calcSize();
        const centerY = (this.minY + this.maxY) / 2;
        for (let i = 0; i < this.rotatableBlockSetList.length; i++) {
            const r = this.rotatableBlockSetList[i];
            if (!r) continue;
            r.local_y = 2 * centerY - r.local_y;
            r.axis_y = 2 * centerY - r.axis_y;
        }
        this.calcSize();
    }

    static createFromPosList(blockSet: BlockSet, posList: Pos[]): RotatableBlockObject {
        const blockSetList: RotatableBlockSet[] = [];
        posList.forEach(pos => {
            const rotatableBlockSet = new RotatableBlockSet(blockSet, pos[0], pos[1], pos[2]);
            blockSetList.push(rotatableBlockSet)
        });
        return new RotatableBlockObject(blockSetList);
    }

    /**
     * NGTOから回転可能なブロックのオブジェクトを作成する
     * @param ngto 
     * @returns 
     */
    static createFromNGTO(ngto: NGTObject, isPlaceAirBlock: boolean): RotatableBlockObject {
        const blockSetList = [];
        for (let yIdx = 0; yIdx < ngto.ySize; yIdx++) {
            for (let xIdx = 0; xIdx < ngto.xSize; xIdx++) {
                for (let zIdx = 0; zIdx < ngto.zSize; zIdx++) {
                    const blockSet = ngto.getBlockSet(xIdx, yIdx, zIdx);
                    if (isPlaceAirBlock || Block.getIdFromBlock(blockSet.block) !== 0) {
                        const rotatableBlockSet = new RotatableBlockSet(blockSet, xIdx, yIdx, zIdx);
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
     * @param zIndex スライスするNGTOのZ座標(0 ～ ngto.zSize-1)
     * @returns 
     */
    static createSliceAtZFromNGTO(ngto: NGTObject, zIndex: number, isPlaceAirBlock: boolean): RotatableBlockObject {
        zIndex = ((zIndex % ngto.zSize) + ngto.zSize) % ngto.zSize;
        const blockSetList = [];
        for (let xIdx = 0; xIdx < ngto.xSize; xIdx++) {
            for (let yIdx = 0; yIdx < ngto.ySize; yIdx++) {
                const blockSet = ngto.getBlockSet(xIdx, yIdx, zIndex);
                if (isPlaceAirBlock || Block.getIdFromBlock(blockSet.block) !== 0) {
                    const rotatableBlockSet = new RotatableBlockSet(blockSet, xIdx, yIdx, 0);
                    blockSetList.push(rotatableBlockSet);
                }
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
    static createSliceAtXFromNGTO(ngto: NGTObject, xIndex: number, isPlaceAirBlock: boolean): RotatableBlockObject {
        xIndex = ((xIndex % ngto.xSize) + ngto.xSize) % ngto.xSize;
        const blockSetList = [];
        for (let yIdx = 0; yIdx < ngto.ySize; yIdx++) {
            for (let zIdx = 0; zIdx < ngto.zSize; zIdx++) {
                const blockSet = ngto.getBlockSet(xIndex, yIdx, zIdx);
                if (isPlaceAirBlock || Block.getIdFromBlock(blockSet.block) !== 0) {
                    const rotatableBlockSet = new RotatableBlockSet(blockSet, 0, yIdx, zIdx);
                    blockSetList.push(rotatableBlockSet);
                }
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
    static createSliceAtYFromNGTO(ngto: NGTObject, yIndex: number, isPlaceAirBlock: boolean): RotatableBlockObject {
        yIndex = ((yIndex % ngto.ySize) + ngto.ySize) % ngto.ySize;
        const blockSetList = [];
        for (let xIdx = 0; xIdx < ngto.xSize; xIdx++) {
            for (let zIdx = 0; zIdx < ngto.zSize; zIdx++) {
                const blockSet = ngto.getBlockSet(xIdx, yIndex, zIdx);
                if (isPlaceAirBlock || Block.getIdFromBlock(blockSet.block) !== 0) {
                    const rotatableBlockSet = new RotatableBlockSet(blockSet, xIdx, 0, zIdx);
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