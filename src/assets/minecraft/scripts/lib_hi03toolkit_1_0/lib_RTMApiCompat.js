function RTMApiCompat() { }
RTMApiCompat.prototype = {}
RTMApiCompat.isOldVer = Packages.jp.ngt.rtm.RTMCore.VERSION.indexOf("1.7.10") >= 0;
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
    if (rider) {
        if (RTMApiCompat.isOldVer) rider.func_70078_a(null);
        else rider.func_184210_p();
    }
}
RTMApiCompat.createNBTFromTileEntity = function (tileEntity) {
    var nbt = new Packages.net.minecraft.nbt.NBTTagCompound();
    if (RTMApiCompat.isOldVer) tileEntity.func_145839_a(nbt);
    else tileEntity.func_189515_b(nbt);
    return nbt;
}
RTMApiCompat.setBlock = function (world, x, y, z, block, metadata) {
    var flag = 3;
    if (RTMApiCompat.isOldVer) world.func_147465_d(x, y, z, block, metadata, flag);
    else BlockUtil.setBlock(world, x, y, z, block, metadata, flag);
}
RTMApiCompat.getBlock = function (world, x, y, z) {
    if (RTMApiCompat.isOldVer) return world.func_147439_a(x, y, z);
    else return BlockUtil.getBlock(world, x, y, z);
}
RTMApiCompat.getMetadata = function (world, x, y, z) {
    if (RTMApiCompat.isOldVer) return world.func_72805_g(x, y, z);
    else return BlockUtil.getMetadata(world, x, y, z);
}
RTMApiCompat.getTileEntity = function (world, x, y, z) {
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
        if (RTMApiCompat.isOldVer) return block.hasTileEntity(blockSet.metadata);
        else return block.hasTileEntity(block.func_176203_a(blockSet.metadata));
    }
    catch (err) {
        Packages.jp.ngt.ngtlib.io.NGTLog.debug("[NGTO Builder] hasTileEntity Error: " + block + " -> " + err);
        return false;
    }
}
RTMApiCompat.setResourceName = function (tileEntity, nbt) {//1.12専用
    if (!RTMApiCompat.isOldVer) {
        var modelName = nbt.func_74779_i("ModelName");
        if (modelName) tileEntity.getResourceState().setResourceName(modelName);
    }
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
    var x = hostPlayer.posX;
    var y = hostPlayer.posY + 2;
    var z = hostPlayer.posZ;
    entity.setPosition(x, y, z);
    entity.motionX = 0;
    entity.motionY = 0;
    entity.motionZ = 0;
}
RTMApiCompat.startRiding = function (entity, targetEntity) {
    if (RTMApiCompat.isOldVer) entity.func_70078_a(targetEntity);
}