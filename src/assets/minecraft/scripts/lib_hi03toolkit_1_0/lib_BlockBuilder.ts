import { HashMap } from "java.util";
import { BlockSet, NGTObject, TileEntityCustom, TileEntityPlaceable } from "jp.ngt.ngtlib.block";
import { TileEntityLargeRailBase } from "jp.ngt.rtm.rail";
import { Block, BlockDoor } from "net.minecraft.block";
import { Entity } from "net.minecraft.entity";
import { NBTTagCompound } from "net.minecraft.nbt";
import { TileEntity } from "net.minecraft.tileentity";
import { RTMApiCompat } from "./lib_RTMApiCompat";
import { UndoManager } from "./lib_UndoManager";
import { RotatableBlockObject } from "./lib_RotatableBlockObject";

export type BlockSetPlacement = [
    blockSet: BlockSet,
    x: number,
    y: number,
    z: number,
    yaw: number
];

export type Pos = [
    x: number,
    y: number,
    z: number
]

//###  BlockBuilder  ###
/**
 * ブロックをまとめて設置するクラス
 * 引数のEntityはHashMapのキーとして使用
 */
export class BlockBuilder {

    private hashMap: HashMap<Entity, BlockSetPlacement[]>;

    constructor() {
        this.hashMap = new HashMap;
    }

    /**
     * ブロック設置が完了しているかどうかを判定する
     * @param entity 
     * @returns 
     */
    isFinished(entity: Entity): boolean {
        const posList = this.get(entity);
        return posList.length === 0;
    }

    /**
     * 残りのブロックの数を取得する
     * @param entity 
     * @returns 
     */
    getCount(entity: Entity): number {
        const posList = this.get(entity);
        return posList.length;
    }

    /**
     * 指定座標のブロックを収集するUndo向け機能
     * @param entity 
     * @param pos [x, y, z]
     */
    addBackup(entity: Entity, pos: Pos): void {
        const posList = this.get(entity);
        const world = entity.worldObj;
        const tileEntity = RTMApiCompat.getTileEntity(world, pos[0], pos[1], pos[2]);
        const block = RTMApiCompat.getBlock(world, pos[0], pos[1], pos[2]);
        const metadata = RTMApiCompat.getMetadata(world, pos[0], pos[1], pos[2]);
        if (block !== null && metadata !== null) {
            let nbt = null;
            let blockRotation = 0;
            if (tileEntity && !(tileEntity instanceof TileEntityLargeRailBase)) {
                if (block instanceof TileEntityPlaceable) blockRotation = block.getRotation();
                nbt = RTMApiCompat.createNBTFromTileEntity(tileEntity);
            }
            const blockSet = !nbt ? new BlockSet(block, metadata) : new BlockSet(block, metadata, nbt);
            posList.push([blockSet, pos[0], pos[1], pos[2], blockRotation]);
            this.set(entity, posList);
        }
    }

    /**
     * 指定座標にブロックを追加する
     * @param entity 
     * @param blockSet 
     * @param x 
     * @param y 
     * @param z 
     */
    add(entity: Entity, blockSet: BlockSet, x: number, y: number, z: number): void {
        const posList = this.get(entity);
        posList.push([blockSet, x, y, z, 0]);
        this.set(entity, posList);
    }

    /**
     * 複数の座標に同じブロックを追加する(塗りつぶし向け機能)
     * @param entity 
     * @param blockSet 
     * @param posList [[x, y, z], ...]
     */
    addAll(entity: Entity, blockSet: BlockSet, posList: Pos[]): void {
        posList.forEach(([x, y, z]: Pos): void => { this.add(entity, blockSet, x, y, z); });
    }

    addFromRotatableBlockObject(entity: Entity, rbo: RotatableBlockObject, placeX: number, placeY: number, placeZ: number): void {
        for (let i = 0; i < rbo.rotatableBlockSetList.length; i++) {
            const rbs = rbo.rotatableBlockSetList[i];
            if (!rbs) continue;
            this.add(entity, rbs.blockSet, rbs.local_x + placeX, rbs.local_y + placeY, rbs.local_z + placeZ);
        }
    }

    /**
     * ブロックのリストをクリアする
     * @param entity 
     */
    clear(entity: Entity): void {
        this.set(entity, []);
    }

    /**
     * ブロックを生成する
     * 終了するまで実行し続ける必要があるため、完了しているかどうかはisFinishedで判定する
     * @param entity 
     * @param buildLimit 1tickあたりのブロック生成数
     */
    doBuild(entity: Entity, buildLimit: number): void {
        const world = entity.worldObj;
        const posList = this.get(entity);
        for (let i = 0; i < buildLimit && posList.length > 0; i++) {
            const data = posList.shift();
            if (!data) break;
            const blockSet = data[0];
            const block = blockSet.block;
            const metadata = blockSet.metadata;
            const x = data[1];
            const y = data[2];
            const z = data[3];
            const blockRotation = data[4];
            //ブロックを設置
            RTMApiCompat.setBlock(world, x, y, z, block, metadata);
            if (block instanceof BlockDoor) {
                const upsideMetadata = 8;
                RTMApiCompat.setBlock(world, x, y + 1, z, block, upsideMetadata);
            }
            if (RTMApiCompat.hasTileEntity(blockSet)) {
                const tileEntity = RTMApiCompat.getTileEntity(world, x, y, z);
                if (tileEntity) BlockBuilder.setTileEntityData(tileEntity, blockSet, x, y, z, blockRotation);
            }
        }
        this.set(entity, posList);
    }

    get(entity: Entity): BlockSetPlacement[] {
        return this.hashMap.get(entity) || [];
    }

    set(entity: Entity, posList: BlockSetPlacement[]): void {
        this.hashMap.put(entity, posList);
    }

    static setTileEntityData(tile: TileEntity, blockSet: BlockSet, x: number, y: number, z: number, yaw: number): void {
        const nbt = blockSet.nbt;
        let prevX = 0;
        let prevY = 0;
        let prevZ = 0;
        if (nbt) {
            const _nbt = nbt.copy() as NBTTagCompound;
            prevX = _nbt.getInteger("x");
            prevY = _nbt.getInteger("y");
            prevZ = _nbt.getInteger("z");
            _nbt.setInteger("x", x);
            _nbt.setInteger("y", y);
            _nbt.setInteger("z", z);

            RTMApiCompat.setResourceName(tile, nbt);//1.12専用

            tile.readFromNBT(_nbt);
        }
        if (tile instanceof TileEntityCustom) {//RTM側のsetPos
            tile.setPos(x, y, z, prevX, prevY, prevZ);
        }
        else {//Minecraft側のsetPos
            RTMApiCompat.setPos(tile, x, y, z);
        }
        if (tile instanceof TileEntityPlaceable) {
            const rotation = tile.getRotation() + yaw;
            tile.setRotation(rotation, true);
        }
    }
}