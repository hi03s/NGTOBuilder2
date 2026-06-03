import { ItemMiniature } from "jp.ngt.mcte.item";
import { NGTObject, TileEntityPlaceable } from "jp.ngt.ngtlib.block";
import { RailMap, RailPosition } from "jp.ngt.rtm.rail.util";
import { NBTTagCompound } from "net.minecraft.nbt";

export class RTMApiCompat {
    static getRailPitch(railMap: RailMap, split: number, index: number): number {
        return railMap.getRailPitch(split, index);
    }

    static getRailYaw(railMap: RailMap, split: number, index: number): number {
        return railMap.getRailYaw(split, index);
    }

    static getCant(railMap: RailMap, split: number, index: number): number {
        return railMap.getCant(split, index);
    }

    static getHorizontalAnchorYaw(rp: RailPosition): number {
        return rp.anchorYaw;
    }

    static getHorizontalAnchorLength(rp: RailPosition): number {
        return rp.anchorLengthHorizontal;
    }

    static getRPAnchorPitch(rp: RailPosition): number {
        return rp.anchorPitch;
    }

    static setOffset(tileEntity: TileEntityPlaceable, x: number, y: number, z: number, sync: boolean): void {
        tileEntity.setOffset(x, y, z, sync);
    }

    static getNGTObjectFromItemNBT(nbt: NBTTagCompound): NGTObject | null {
        return ItemMiniature.getNGTObject(nbt);
    }
}
