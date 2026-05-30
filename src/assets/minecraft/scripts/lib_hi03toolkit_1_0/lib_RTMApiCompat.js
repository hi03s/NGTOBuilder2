function RTMApiCompat() { }
RTMApiCompat.prototype = {}
RTMApiCompat.isOldVer = Packages.jp.ngt.rtm.RTMCore.VERSION.indexOf("1.7.10") >= 0;
RTMApiCompat.isKaizPatch = Packages.jp.ngt.rtm.RTMCore.VERSION.indexOf("KaizPatch") !== -1;
RTMApiCompat.isFixRTM = !RTMApiCompat.isOldVer ? Packages.net.minecraftforge.fml.common.Loader.isModLoaded("fix-rtm") : false;
RTMApiCompat.getRider = function (entity) {
    if (RTMApiCompat.isOldVer) {
        return entity.field_70153_n;
    }
    else {
        var passengers = entity.func_184188_bt();
        var rider = passengers.size() > 0 ? passengers.get(0) : null;
        return rider;
    }
};
RTMApiCompat.getRidingEntity = function (entity) {
    if (RTMApiCompat.isOldVer) return entity.field_70154_o;
    else return entity.func_184187_bx();
};
RTMApiCompat.dismountPlayer = function (entity) {
    var rider = RTMApiCompat.getRider(entity);
    if (rider) RTMApiCompat.dismount(rider);
}
RTMApiCompat.dismount = function (entity) {
    if (RTMApiCompat.isOldVer) entity.func_70078_a(null);
    else entity.func_184210_p();
}
RTMApiCompat.createNBTFromTileEntity = function (tileEntity) {
    var nbt = new Packages.net.minecraft.nbt.NBTTagCompound();
    if (RTMApiCompat.isOldVer) tileEntity.func_145841_b(nbt);
    else tileEntity.func_189515_b(nbt);
    return nbt;
}
RTMApiCompat.setBlock = function (world, x, y, z, block, metadata) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    var flag = 3;
    if (RTMApiCompat.isOldVer) world.func_147465_d(x, y, z, block, metadata, flag);
    else Packages.jp.ngt.ngtlib.block.BlockUtil.setBlock(world, x, y, z, block, metadata, flag);
}
RTMApiCompat.getBlock = function (world, x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (RTMApiCompat.isOldVer) return world.func_147439_a(x, y, z);
    else return Packages.jp.ngt.ngtlib.block.BlockUtil.getBlock(world, x, y, z);
}
RTMApiCompat.getMetadata = function (world, x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (RTMApiCompat.isOldVer) return world.func_72805_g(x, y, z);
    else return Packages.jp.ngt.ngtlib.block.BlockUtil.getMetadata(world, x, y, z);
}
RTMApiCompat.getTileEntity = function (world, x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (RTMApiCompat.isOldVer) return world.func_147438_o(x, y, z);
    else {
        var blockPos = new Packages.net.minecraft.util.math.BlockPos(Math.floor(x), Math.floor(y), Math.floor(z));
        return world.func_175625_s(blockPos);
    }
}
RTMApiCompat.hasTileEntity = function (blockSet) {
    if (!blockSet || !blockSet.block) return false;
    var block = blockSet.block;
    try {
        if (block instanceof Packages.net.minecraft.block.ITileEntityProvider) return true;
        if (RTMApiCompat.isOldVer) return block.hasTileEntity(blockSet.metadata);
        else return block.hasTileEntity(block.func_176203_a(blockSet.metadata));
    }
    catch (err) {
        Packages.jp.ngt.ngtlib.io.NGTLog.debug("[NGTO Builder] hasTileEntity Error: " + block + " -> " + err);
        return false;
    }
}
RTMApiCompat.setResourceName = function (tileEntity, modelName) {//1.12専用
    if (!RTMApiCompat.isOldVer) tileEntity.getResourceState().setResourceName(modelName);
}
RTMApiCompat.setPos = function (tileEntity, x, y, z) {
    if (RTMApiCompat.isOldVer) {
        tileEntity.field_145851_c = x;
        tileEntity.field_145848_d = y;
        tileEntity.field_145849_e = z;
    }
    else {
        tileEntity.func_174878_a(new Packages.net.minecraft.util.math.BlockPos(x, y, z));
    }
}
RTMApiCompat.getItemStackAt = function (inventory, index) {
    if (RTMApiCompat.isOldVer) return inventory.field_70462_a[index];
    else return inventory.field_70462_a.get(index);
}
RTMApiCompat.doFollowing = function (entity, hostPlayer) {//1.12専用
    if (!entity || !hostPlayer || RTMApiCompat.isOldVer) return;
    var x = hostPlayer.field_70165_t;
    var y = hostPlayer.field_70163_u + 3;
    var z = hostPlayer.field_70161_v;
    entity.func_70107_b(x, y, z);
    entity.field_70159_w = 0;
    entity.field_70181_x = 0;
    entity.field_70179_y = 0;
}
RTMApiCompat.startRiding = function (entity, targetEntity) {
    if (RTMApiCompat.isOldVer) entity.func_70078_a(targetEntity);
}
RTMApiCompat.getRailPitch = function (railMap, split, index) {
    if (RTMApiCompat.isOldVer && !RTMApiCompat.isKaizPatch) return railMap.getRailPitch();
    else return railMap.getRailPitch(split, index);
}
RTMApiCompat.getCant = function (railMap, split, index) {
    if (RTMApiCompat.isOldVer && !RTMApiCompat.isKaizPatch) return 0;
    else return railMap.getCant(split, index);
}
RTMApiCompat.getHorizontalAnchorYaw = function (rp) {
    if (RTMApiCompat.isOldVer && !RTMApiCompat.isKaizPatch) return rp.anchorDirection;
    else return rp.anchorYaw;
}
RTMApiCompat.getHorizontalAnchorLength = function (rp) {
    if (RTMApiCompat.isOldVer && !RTMApiCompat.isKaizPatch) return rp.anchorLength;
    else return rp.anchorLengthHorizontal;
}
RTMApiCompat.getRPAnchorPitch = function (rp) {
    if (RTMApiCompat.isOldVer && !RTMApiCompat.isKaizPatch) return (new Packages.jp.ngt.ngtlib.math.Vec3(endRP.posX - startRP.posX, endRP.posY - startRP.posY, endRP.posZ - startRP.posZ)).getPitch();
    else return rp.anchorPitch;
}
RTMApiCompat.getSubType = function (itemStack) {
    if (RTMApiCompat.isOldVer) return itemStack.func_77973_b().getSubType(itemStack);
    else return itemStack.func_77973_b().getModelState(itemStack).type.subType;
}
RTMApiCompat.setOffset = function (tileEntity, x, y, z, sync) {
    if (RTMApiCompat.isKaizPatch || RTMApiCompat.isFixRTM) tileEntity.setOffset(x, y, z, sync);
}
RTMApiCompat.setWireConnection = function (tileEntity, targetPos, wireStack) {
    if (wireStack.func_77973_b() !== Packages.jp.ngt.rtm.RTMItem.itemWire) return;
    var sx = Math.floor(tileEntity.field_145851_c);
    var sy = Math.floor(tileEntity.field_145848_d);
    var sz = Math.floor(tileEntity.field_145849_e);
    var x = Math.floor(targetPos[0]);
    var y = Math.floor(targetPos[1]);
    var z = Math.floor(targetPos[2]);
    if (x === sx && y === sy && z === sz) {
        Packages.jp.ngt.ngtlib.io.NGTLog.debug("[NGTO Builder] Skip self wire connection: " + x + "," + y + "," + z);
        return;
    }
    if (y < 0 || y >= 256) {
        Packages.jp.ngt.ngtlib.io.NGTLog.debug("[NGTO Builder] Skip wire connection: invalid target y=" + y + " pos=" + x + "," + y + "," + z);
        return;
    }
    if (RTMApiCompat.isOldVer) {
        var modelName = wireStack.func_77973_b().getModelName(wireStack);
        tileEntity.setConnectionTo(x, y, z, Packages.jp.ngt.rtm.electric.Connection.ConnectionType.WIRE, modelName);
    }
    else {
        var resourceState = wireStack.func_77973_b().getModelState(wireStack);
        tileEntity.setConnectionTo(x, y, z, Packages.jp.ngt.rtm.electric.Connection.ConnectionType.WIRE, resourceState);
    }
}
RTMApiCompat.getModelNameFromItem = function (itemStack) {
    if (RTMApiCompat.isOldVer) return itemStack.getTagCompound().getString("ModelName");
    else {
        if (itemStack.func_77973_b() instanceof Packages.jp.ngt.rtm.item.ItemInstalledObject) {
            if (itemStack.func_77973_b().getModelState(itemStack)) return itemStack.func_77973_b().getModelState(itemStack).getResourceName();
        }
        return "";
        //return itemStack.func_77973_b() instanceof Packages.jp.ngt.rtm.item.ItemInstalledObject ? itemStack.func_77973_b().getModelState(itemStack) ? itemStack.func_77973_b().getModelState(itemStack).getResourceName() : "" : "";
    }
}