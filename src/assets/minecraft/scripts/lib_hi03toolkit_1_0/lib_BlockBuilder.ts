import { HashMap } from "java.util";
import { BlockSet, TileEntityCustom, TileEntityPlaceable } from "jp.ngt.ngtlib.block";
import { TileEntityLargeRailBase } from "jp.ngt.rtm.rail";
import { BlockDoor } from "net.minecraft.block";
import { Entity } from "net.minecraft.entity";
import { NBTTagCompound } from "net.minecraft.nbt";
import { TileEntity } from "net.minecraft.tileentity";
import { RTMApiCompat } from "./lib_RTMApiCompat";
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
    private processed: HashMap<Entity, number>;

    constructor() {
        this.hashMap = new HashMap();
        this.processed = new HashMap();
    }

    /**
     * ブロック設置が完了しているかどうかを判定する
     * @param entity 
     * @returns 
     */
    isFinished(entity: Entity): boolean {
        const posList = this.get(entity);
        const processed = this.getProcessed(entity);
        return processed >= posList.length;
    }

    /**
     * 残りのブロックの数を取得する
     * @param entity 
     * @returns 
     */
    getCount(entity: Entity): number {
        const posList = this.get(entity);
        const processed = this.getProcessed(entity);
        return Math.max(0, posList.length - processed);
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
        this.setProcessed(entity, 0);
    }

    /**
     * ブロックを生成する
     * 終了するまで実行し続ける必要があるため、完了しているかどうかはisFinishedで判定する
     * @param entity 
     * @param buildLimit 1tickあたりのブロック生成数
     */
    doBuild(entity: Entity, buildLimit: number): void {
        if (buildLimit <= 0) return;
        const world = entity.worldObj;
        const posList = this.get(entity);
        let processed = this.getProcessed(entity);
        if (processed >= posList.length) {
            this.clear(entity);
            return;
        }
        const end = Math.min(processed + buildLimit, posList.length);
        for (let i = processed; i < end; i++) {
            const data = posList[i];
            if (!data) continue;
            const blockSet = data[0];
            const block = blockSet.block;
            const metadata = blockSet.metadata;
            if (blockSet.block instanceof BlockDoor && metadata >= 8) continue; // ドア上部はスキップ
            const x = data[1];
            const y = data[2];
            const z = data[3];
            const blockRotation = data[4];
            const replaceBlock = RTMApiCompat.getBlock(world, x, y, z);
            const replaceBlockMeta = RTMApiCompat.getMetadata(world, x, y, z);
            if (replaceBlock === block && replaceBlockMeta === metadata) continue;
            const tile = RTMApiCompat.getTileEntity(world, x, y, z);
            if (tile instanceof TileEntityLargeRailBase) continue;
            // ブロックを設置
            RTMApiCompat.setBlock(world, x, y, z, block, metadata);
            if (block instanceof BlockDoor) {
                const upsideMetadata = 8;
                RTMApiCompat.setBlock(world, x, y + 1, z, block, upsideMetadata);
            }
            if (RTMApiCompat.hasTileEntity(blockSet)) {
                const tileEntity = RTMApiCompat.getTileEntity(world, x, y, z);
                if (tileEntity) {
                    BlockBuilder.setTileEntityData(tileEntity, blockSet, x, y, z, blockRotation);
                }
            }
        }
        processed = end;
        if (processed >= posList.length) {
            this.clear(entity);
        }
        else {
            this.setProcessed(entity, processed);
        }
    }

    get(entity: Entity): BlockSetPlacement[] {
        return this.hashMap.get(entity) || [];
    }

    set(entity: Entity, posList: BlockSetPlacement[]): void {
        this.hashMap.put(entity, posList);
    }

    getProcessed(entity: Entity): number {
        return this.processed.get(entity) || 0;
    }

    setProcessed(entity: Entity, processed: number): void {
        this.processed.put(entity, processed);
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