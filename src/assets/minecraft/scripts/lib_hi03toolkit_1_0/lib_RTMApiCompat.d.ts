import { BlockSet, TileEntityPlaceable } from "jp.ngt.ngtlib.block";
import { Vec3 } from "jp.ngt.ngtlib.math";
import { TileEntityInsulator } from "jp.ngt.rtm.electric";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { RailMap, RailPosition } from "jp.ngt.rtm.rail.util";
import { Block } from "net.minecraft.block";
import { Entity } from "net.minecraft.entity";
import { InventoryPlayer } from "net.minecraft.entity.player";
import { ItemStack } from "net.minecraft.item";
import { NBTTagCompound } from "net.minecraft.nbt";
import { TileEntity } from "net.minecraft.tileentity";
import { World } from "net.minecraft.world";

//lib_RTMApiCompat.jsの型定義ファイル
/**
 * RTMのバージョン差異を吸収するためのクラスです。RTMのバージョンによっては正常に動作しない機能もあります
 * 
 * 1.12と1.7.10の両方で動作するように設計されていますが、すべてのバージョンで完全な互換性があるわけではありません
 */
export class RTMApiCompat {
    static isOldVer: boolean;
    static getRider(entity: EntityVehicle): Entity | null;
    static getRidingEntity(entity: EntityVehicle): Entity | null;
    static dismountPlayer(entity: EntityVehicle): void;
    static createNBTFromTileEntity(tileEntity: TileEntity): NBTTagCompound;
    static setBlock(world: World, x: number, y: number, z: number, block: Block, metadata: number): void;
    static getBlock(world: World, x: number, y: number, z: number): Block | null;
    static getMetadata(world: World, x: number, y: number, z: number): number | null;
    static getTileEntity(world: World, x: number, y: number, z: number): TileEntity | null;
    static hasTileEntity(blockSet: BlockSet | null): boolean;
    static setResourceName(tileEntity: TileEntity, nbt: NBTTagCompound): void;
    static setPos(tileEntity: TileEntity, x: number, y: number, z: number): void;
    static getItemStackAt(inventory: InventoryPlayer, index: number): ItemStack | null;
    static doFollowing(entity: Entity, hostPlayer: Entity): void;
    static startRiding(entity: Entity, targetEntity: Entity): void;
    static getRailPitch(railMap: RailMap, split: number, index: number): number;
    static getCant(railMap: RailMap, split: number, index: number): number;
    static getHorizontalAnchorYaw(rp: RailPosition): number;
    static getHorizontalAnchorLength(rp: RailPosition): number;
    static getRPAnchorPitch(rp: RailPosition): number;
    static getSubType(itemStack: ItemStack): string;
    static setOffset(tileEntity: TileEntityPlaceable, x: number, y: number, z: number, sync: boolean): void;
    static setWireConnection(tileEntity: TileEntityInsulator, targetPos: number[], wireStack: ItemStack): void;
}