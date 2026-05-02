function RTMApiCompatClient() { }
RTMApiCompatClient.prototype = {}
RTMApiCompatClient.isOldVer = Packages.jp.ngt.rtm.RTMCore.VERSION.indexOf("1.7.10") >= 0;
RTMApiCompatClient.getLookingPos = function () {
    var player = Packages.jp.ngt.ngtlib.util.MCWrapperClient.getPlayer();
    var mop = Packages.jp.ngt.ngtlib.block.BlockUtil.getMOPFromPlayer(player, 512, true);
    if (mop) {
        var lookingVec = mop.field_72307_f;
        var posX = lookingVec.field_72450_a;
        var posY = lookingVec.field_72448_b;
        var posZ = lookingVec.field_72449_c;
        if (RTMApiCompatClient.isOldVer) {
            var hitX = mop.field_72311_b;
            var hitY = mop.field_72312_c;
            var hitZ = mop.field_72309_d;
            var side = mop.field_72310_e;
            var dx = 0;
            var dy = 0;
            var dz = 0;
            if (side === 0) dy = -1;      // 下
            else if (side === 1) dy = 1;  // 上
            else if (side === 2) dz = -1; // 北
            else if (side === 3) dz = 1;  // 南
            else if (side === 4) dx = -1; // 西
            else if (side === 5) dx = 1;  // 東
            return {
                posX: posX,
                posY: posY,
                posZ: posZ,
                blockX: hitX,
                blockY: hitY,
                blockZ: hitZ,
                placeX: hitX + dx,
                placeY: hitY + dy,
                placeZ: hitZ + dz,
                side: side
            };
        }
        else {
            var blockPos = mop.func_178782_a();
            var facing = mop.field_178784_b;
            var dir = facing.func_176730_m();
            var hitX = blockPos.func_177958_n();
            var hitY = blockPos.func_177956_o();
            var hitZ = blockPos.func_177952_p();
            return {
                posX: posX,
                posY: posY,
                posZ: posZ,
                blockX: hitX,
                blockY: hitY,
                blockZ: hitZ,
                placeX: hitX + dir.func_177958_n(),
                placeY: hitY + dir.func_177956_o(),
                placeZ: hitZ + dir.func_177952_p(),
                side: facing.func_176745_a()
            };
        }
    }
    return null;
}
RTMApiCompatClient.generateGLList = function () {
    if (RTMApiCompatClient.isOldVer) return Packages.jp.ngt.ngtlib.renderer.GLHelper.generateGLList();
    else return Packages.jp.ngt.ngtlib.renderer.GLHelper.generateGLList(null);
}
RTMApiCompatClient.ngtoWorld = new java.util.HashMap();
RTMApiCompatClient.renderNGTO = function (renderer, ngto, pass) {
    var NGTUtil = Packages.jp.ngt.ngtlib.util.NGTUtil;
    var modelObj = NGTUtil.getField(PartsRenderer.class, renderer, "modelObj");
    var matId = renderer.currentMatId;
    if (modelObj) {
        var defaultTexture = modelObj.textures[matId].material.texture;
        renderer.bindTexture(Packages.net.minecraft.client.renderer.texture.TextureMap.field_110575_b);
        if (RTMApiCompatClient.isOldVer) {
            Packages.jp.ngt.ngtlib.renderer.NGTRenderer.renderNGTObject(ngto, true);
        }
        else {
            var world = RTMApiCompatClient.ngtoWorld.get(ngto);
            if (!world) {
                world = new Packages.jp.ngt.ngtlib.world.NGTWorld(NGTUtil.getClientWorld(), ngto);
                RTMApiCompatClient.ngtoWorld.put(ngto, world);
            }
            Packages.jp.ngt.ngtlib.renderer.NGTObjectRenderer.INSTANCE.renderNGTObject(world, ngto, true, 0, pass);
        }
        renderer.bindTexture(defaultTexture);
    }
}