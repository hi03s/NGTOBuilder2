import { BlockSet, NGTObject } from "jp.ngt.ngtlib.block";
import { NGTLog } from "jp.ngt.ngtlib.io";
import { RTMItem } from "jp.ngt.rtm";
import { Connection, TileEntityInsulator } from "jp.ngt.rtm.electric";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ItemWithModel } from "jp.ngt.rtm.item";
import { RailMap, RailPosition } from "jp.ngt.rtm.rail.util";
import { Block } from "net.minecraft.block";
import { ICommandSender } from "net.minecraft.command";
import { Entity } from "net.minecraft.entity";
import { InventoryPlayer } from "net.minecraft.entity.player";
import { Blocks } from "net.minecraft.init";
import { ItemStack } from "net.minecraft.item";
import { NBTTagCompound } from "net.minecraft.nbt";
import { TileEntity } from "net.minecraft.tileentity";
import { World } from "net.minecraft.world";

export type Pos = [x: number, y: number, z: number];

export class RTMApiCompat {
    static getRider(entity: EntityVehicle): Entity | null {
        return entity.riddenByEntity;
    }

    static getRidingEntity(entity: EntityVehicle): Entity | null {
        return entity.ridingEntity;
    }

    static getWorld(entity: unknown): World {
        return (entity as Entity).worldObj;
    }

    static dismountPlayer(entity: EntityVehicle): void {
        const rider = RTMApiCompat.getRider(entity);
        if (rider) RTMApiCompat.dismount(rider);
    }

    static dismount(entity: Entity): void {
        entity.mountEntity(null as Entity);
    }

    static createNBTFromTileEntity(tileEntity: TileEntity): NBTTagCompound {
        const nbt = new NBTTagCompound();
        tileEntity.writeToNBT(nbt);
        return nbt;
    }

    static setBlock(world: World, x: number, y: number, z: number, block: Block, metadata: number): void {
        x = Math.floor(x);
        y = Math.floor(y);
        z = Math.floor(z);
        world.setBlock(x, y, z, block, metadata, 3);
    }

    static getBlock(world: World, x: number, y: number, z: number): Block | null {
        x = Math.floor(x);
        y = Math.floor(y);
        z = Math.floor(z);
        return world.getBlock(x, y, z);
    }

    static getMetadata(world: World, x: number, y: number, z: number): number | null {
        x = Math.floor(x);
        y = Math.floor(y);
        z = Math.floor(z);
        return world.getBlockMetadata(x, y, z);
    }

    static getTileEntity(world: World, x: number, y: number, z: number): TileEntity | null {
        x = Math.floor(x);
        y = Math.floor(y);
        z = Math.floor(z);
        return world.getTileEntity(x, y, z);
    }

    static hasTileEntity(blockSet: BlockSet | null): boolean {
        if (!blockSet || !blockSet.block) return false;
        const block = blockSet.block;
        try {
            return block.hasTileEntity(blockSet.metadata);
        } catch (err) {
            NGTLog.debug("[NGTO Builder] hasTileEntity Error: " + block + " -> " + err);
            return false;
        }
    }

    static setResourceName(tileEntity: TileEntity, modelName: string): void {
        void tileEntity;
        void modelName;
    }

    static setPos(tileEntity: TileEntity, x: number, y: number, z: number): void {
        tileEntity.xCoord = x;
        tileEntity.yCoord = y;
        tileEntity.zCoord = z;
    }

    static getItemStackAt(inventory: InventoryPlayer, index: number): ItemStack | null {
        return inventory.mainInventory[index];
    }

    static getInventorySize(inventory: InventoryPlayer): number {
        return inventory.mainInventory.length;
    }

    static doFollowing(entity: unknown, hostPlayer: unknown): void {
        void entity;
        void hostPlayer;
    }

    static startRiding(entity: unknown, targetEntity: unknown): void {
        (entity as Entity).mountEntity(targetEntity as Entity);
    }

    static sendChatMessage(target: unknown, message: string): void {
        NGTLog.sendChatMessage(target as ICommandSender, message);
    }

    static getNGTObjectFromItemNBT(nbt: NBTTagCompound): NGTObject | null {
        void nbt;
        return null;
    }

    static getRailPitch(railMap: RailMap, split: number, index: number): number {
        void split;
        void index;
        return railMap.getRailPitch();
    }

    static getRailYaw(railMap: RailMap, split: number, index: number): number {
        return railMap.getRailRotation(split, index);
    }

    static getCant(railMap: RailMap, split: number, index: number): number {
        void railMap;
        void split;
        void index;
        return 0;
    }

    static getHorizontalAnchorYaw(rp: RailPosition): number {
        return rp.anchorDirection;
    }

    static getHorizontalAnchorLength(rp: RailPosition): number {
        return rp.anchorLength;
    }

    static getRPAnchorPitch(rp: RailPosition): number {
        void rp;
        return 0;
    }

    static getSubType(itemStack: ItemStack): string {
        return (itemStack.getItem() as ItemWithModel).getSubType(itemStack);
    }

    static getItemDamage(itemStack: ItemStack): number {
        return itemStack.getItemDamage();
    }

    static getBlockAir(): Block {
        return Blocks.air;
    }

    static getBlockStone(): Block {
        return Blocks.stone;
    }

    static setOffset(tileEntity: TileEntity, x: number, y: number, z: number, sync: boolean): void {
        void tileEntity;
        void x;
        void y;
        void z;
        void sync;
    }

    static setWireConnection(tileEntity: TileEntityInsulator, targetPos: Pos, wireStack: ItemStack): void {
        if (wireStack.getItem() !== RTMItem.itemWire) return;
        const sx = Math.floor(tileEntity.xCoord);
        const sy = Math.floor(tileEntity.yCoord);
        const sz = Math.floor(tileEntity.zCoord);
        const x = Math.floor(targetPos[0]);
        const y = Math.floor(targetPos[1]);
        const z = Math.floor(targetPos[2]);
        if (x === sx && y === sy && z === sz) {
            NGTLog.debug("[NGTO Builder] Skip self wire connection: " + x + "," + y + "," + z);
            return;
        }
        if (y < 0 || y >= 256) {
            NGTLog.debug("[NGTO Builder] Skip wire connection: invalid target y=" + y + " pos=" + x + "," + y + "," + z);
            return;
        }
        const modelName = (wireStack.getItem() as ItemWithModel).getModelName(wireStack);
        tileEntity.setConnectionTo(x, y, z, Connection.ConnectionType.WIRE, modelName);
    }

    static getModelNameFromItem(itemStack: ItemStack): string {
        const tag = itemStack.getTagCompound();
        return tag ? tag.getString("ModelName") : "";
    }
}
