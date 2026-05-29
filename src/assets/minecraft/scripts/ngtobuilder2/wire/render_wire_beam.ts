import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapper, MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ModelSetVehicle } from "jp.ngt.rtm.modelpack.modelset";
import { ModelObject, Parts, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { ICommandSender } from "net.minecraft.command";
import { EntityPlayer } from "net.minecraft.entity.player";
import { Keyboard, Mouse } from "org.lwjgl.input";
import { NGTOBuilderUtilClient } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtilClient";
import { RTMApiCompat } from "../../lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { GL11 } from "org.lwjgl.opengl";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { InputManager } from "../../lib_hi03toolkit_1_0/lib_InputManager";
import { InsulatorCollector, InsulatorPos } from "../../lib_hi03toolkit_1_0/lib_InsulatorCollector";
import { ItemInstalledObject } from "jp.ngt.rtm.item";
import { Item, ItemStack } from "net.minecraft.item";
import { RTMItem } from "jp.ngt.rtm";
import { HashMap } from "java.util";
import { Vec3 } from "jp.ngt.ngtlib.math";
import { ReceiveData_beam } from "./server_wire_beam";
import { Entity } from "net.minecraft.entity";
import { DataMap } from "jp.ngt.rtm.modelpack.state";

declare const renderer: VehiclePartsRenderer;

//##  NGTO Builder2 ワイヤー式ビーム専用設置ツール  ##

function init(par1: ModelSetVehicle, par2: ModelObject): void {
    keyManager = new InputManager();

    Version = "1.0";

    //ーー共通ーー
    keyManager.setOptionKey(Keyboard.KEY_LCONTROL);
    keyManager.register("showHelp", Keyboard.KEY_H, false, "ヘルプを表示");
    keyManager.register("endEdit", Keyboard.KEY_Q, false, "ツールを終了");
    keyManager.register("build", Keyboard.KEY_RETURN, false, "生成する");
    keyManager.register("cancelBuild", Keyboard.KEY_BACK, true, "生成を中止する");
    keyManager.register("undo", Keyboard.KEY_Z, true, "Undo");

    //ーーカーソル操作ーー
    keyManager.register("resetSelected", Keyboard.KEY_C, false, "すべての選択をリセットする");

    //ーービーム操作ーー
    keyManager.register("isBeamInsulatorMode", Keyboard.KEY_I, true, "ワイヤー式ビームの碍子の設置位置を切り替える");
    keyManager.register("laneLeft", Keyboard.KEY_LEFT, true, "左にレーンを増やす/右のレーンを減らす");
    keyManager.register("laneRight", Keyboard.KEY_RIGHT, true, "右にレーンを増やす/左のレーンを減らす");
    keyManager.register("laneDistanceIncrease", Keyboard.KEY_RIGHT, false, "レーン間の距離を増やす");
    keyManager.register("laneDistanceDecrease", Keyboard.KEY_LEFT, false, "レーン間の距離を減らす");
    keyManager.register("beamDistanceIncrease", Keyboard.KEY_UP, false, "ワイヤー式ビームの余長を0.1m増やす");
    keyManager.register("beamDistanceDecrease", Keyboard.KEY_DOWN, false, "ワイヤー式ビームの余長を0.1m減らす");

    ignoreItemList = [
        RTMItem.itemWire,
        RTMItem.installedObject
    ];

    baseCollectorCache = new HashMap();
    beamCollectorCache = new HashMap();
    initParts();
}

var ignoreItemList: Item[];
var keyManager: InputManager;
var Version: string;
var baseCollectorCache: HashMap<Entity, InsulatorCollector>;
var beamCollectorCache: HashMap<Entity, InsulatorCollector>;

function keyInput(hostPlayer: EntityPlayer, entity: EntityVehicle, isRightClick: boolean, isLeftClick: boolean): void {
    const sender = hostPlayer as unknown as ICommandSender;
    const dataMap = entity.getResourceState().getDataMap();
    const lookingPos = NGTOBuilderUtilClient.getLookingPos();

    let baseCollector = baseCollectorCache.get(entity);
    if (!baseCollector) {
        baseCollector = new InsulatorCollector();
        baseCollectorCache.put(entity, baseCollector);
    }

    let beamCollector = beamCollectorCache.get(entity);
    if (!beamCollector) {
        beamCollector = new InsulatorCollector();
        beamCollectorCache.put(entity, beamCollector);
    }

    if (keyManager.pressed("showHelp")) {
        NGTLog.sendChatMessage(sender, `---NGTO Builder2 ビーム設置 操作方法---`);
        NGTLog.sendChatMessage(sender, keyManager.getDescription("endEdit"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("build"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("cancelBuild"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("undo"));

        NGTLog.sendChatMessage(sender, `---カーソル操作---`);
        NGTLog.sendChatMessage(sender, `[右クリック] レール上の座標を選択`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyManager.getOptionKeyCode())} + 右クリック] レール上の座標を選択(180度回転)`);
        NGTLog.sendChatMessage(sender, `[左クリック] 最後の選択を解除`);
        NGTLog.sendChatMessage(sender, keyManager.getDescription("resetSelected"));

        NGTLog.sendChatMessage(sender, `---ビーム操作---`);
        NGTLog.sendChatMessage(sender, keyManager.getDescription("isBeamInsulatorMode"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("laneLeft"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("laneRight"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("laneDistanceIncrease"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("laneDistanceDecrease"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("beamDistanceIncrease"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("beamDistanceDecrease"));
    }

    //終了
    if (keyManager.down("endEdit")) {
        dataMap.setBoolean("isEndEdit", true, 1);
    }

    const beamWire = getBeamWire(hostPlayer);
    const beamInsulatorName = getBeamInsulatorName(hostPlayer);

    let laneCount = dataMap.getInt("laneCount");
    let laneDistance = dataMap.getDouble("laneDistance");
    let beamDistance = dataMap.getDouble("beamDistance");
    const isBuilding = dataMap.getBoolean("isBuilding");
    const isUndo = dataMap.getBoolean("isUndo");

    if (laneDistance === 0) {
        laneDistance = 4.0;
        dataMap.setDouble("laneDistance", laneDistance, 0);
    }

    if (beamDistance === 0) {
        beamDistance = 0.0;
        dataMap.setDouble("beamDistance", beamDistance, 0);
    }

    //生成
    if (keyManager.pressed("build") && beamCollector.size(entity) > 0 && beamWire && !isUndo && !isBuilding) {
        dataMap.setBoolean("isBuilding", true, 1);

        const sendData: ReceiveData_beam = {
            beamPosList: beamCollector.getAll(entity),
            beamInsulatorName: beamInsulatorName
        };

        NGTOBuilderUtil.sendJsonData(dataMap, "sendData", sendData);
        NGTLog.sendChatMessage(sender, "[NGTO Builder2] 生成中...");
    }

    //生成を中止する
    if (keyManager.pressed("cancelBuild") && isBuilding) {
        NGTLog.sendChatMessage(sender, "[NGTO Builder2] 生成を中止");
        dataMap.setBoolean("cancelBuild", true, 1);
    }

    //Undo
    const canUndo = dataMap.getBoolean("canUndo");
    if (keyManager.pressed("undo") && canUndo && !isBuilding && !isUndo) {
        dataMap.setBoolean("isUndo", true, 1);
        NGTLog.sendChatMessage(sender, "[NGTO Builder2] Undo...");
    }

    //座標を追加
    let heldItem: ItemStack | null = NGTOBuilderUtil.getHeldItem(hostPlayer);
    if (lookingPos && isRightClick && (!heldItem || (heldItem && ignoreItemList.indexOf(heldItem.getItem()) === -1))) {
        const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.posX, lookingPos.posY, lookingPos.posZ);
        if (lookingRailMap) {
            const split = Math.floor(lookingRailMap.getLength() * 2);
            const rmIndex = lookingRailMap.getNearlestPoint(split, lookingPos.posX, lookingPos.posZ);
            const rmPosZX = lookingRailMap.getRailPos(split, rmIndex);
            const rmPosY = lookingRailMap.getRailHeight(split, rmIndex);
            let rmYaw = lookingRailMap.getRailYaw(split, rmIndex);
            if (keyManager.downOptionKey()) rmYaw += 180;

            const heightOffsetY = rmPosY - Math.floor(rmPosY) - (1 / 16);

            // 架線偏位は考慮しない
            baseCollector.add(
                entity,
                rmPosZX[1],
                Math.floor(rmPosY) + 5.5 + heightOffsetY,
                rmPosZX[0],
                1,
                rmYaw
            );

            rebuildBeam(entity, baseCollector, beamCollector, dataMap);
        }
    }

    //選択を解除
    if (isLeftClick && (!heldItem || (heldItem && ignoreItemList.indexOf(heldItem.getItem()) === -1))) {
        baseCollector.pop(entity);
        rebuildBeam(entity, baseCollector, beamCollector, dataMap);
    }

    //すべての選択をリセットする
    if (keyManager.pressed("resetSelected")) {
        baseCollector.clear(entity);
        beamCollector.clear(entity);
    }

    //ワイヤー式ビームの碍子の設置位置を切り替える
    if (keyManager.pressed("isBeamInsulatorMode")) {
        const isBeamInsulatorMode = dataMap.getBoolean("isBeamInsulatorMode");
        dataMap.setBoolean("isBeamInsulatorMode", !isBeamInsulatorMode, 0);
        NGTLog.sendChatMessage(sender, `ワイヤー式ビームの碍子の設置位置: ${isBeamInsulatorMode ? "空中" : "地面"}`);
        rebuildBeam(entity, baseCollector, beamCollector, dataMap);
    }

    //左にレーンを増やす/右のレーンを減らす
    if (keyManager.pressed("laneLeft")) {
        laneCount = laneCount - 1;
        dataMap.setInt("laneCount", laneCount, 0);
        const laneDescription = laneCount > 0 ? `R+${laneCount}` : laneCount < 0 ? `L+${Math.abs(laneCount)}` : "0";
        NGTLog.sendChatMessage(sender, `レーン数: ${laneDescription}`);
        rebuildBeam(entity, baseCollector, beamCollector, dataMap);
    }

    //右にレーンを増やす/左のレーンを減らす
    if (keyManager.pressed("laneRight")) {
        laneCount = laneCount + 1;
        dataMap.setInt("laneCount", laneCount, 0);
        const laneDescription = laneCount > 0 ? `R+${laneCount}` : laneCount < 0 ? `L+${Math.abs(laneCount)}` : "0";
        NGTLog.sendChatMessage(sender, `レーン数: ${laneDescription}`);
        rebuildBeam(entity, baseCollector, beamCollector, dataMap);
    }

    //レーン間の距離を増やす
    if (keyManager.pressed("laneDistanceIncrease") || keyManager.held("laneDistanceIncrease", 500)) {
        laneDistance += 0.1;
        dataMap.setDouble("laneDistance", laneDistance, 0);
        NGTLog.sendChatMessage(sender, `レーン間の距離: ${laneDistance.toFixed(1)}m`);
        rebuildBeam(entity, baseCollector, beamCollector, dataMap);
    }

    //レーン間の距離を減らす
    if (keyManager.pressed("laneDistanceDecrease") || keyManager.held("laneDistanceDecrease", 500)) {
        laneDistance = Math.max(0, laneDistance - 0.1);
        dataMap.setDouble("laneDistance", laneDistance, 0);
        NGTLog.sendChatMessage(sender, `レーン間の距離: ${laneDistance.toFixed(1)}m`);
        rebuildBeam(entity, baseCollector, beamCollector, dataMap);
    }

    //ワイヤー式ビームの余長を0.1m増やす
    if (keyManager.pressed("beamDistanceIncrease") || keyManager.held("beamDistanceIncrease", 500)) {
        beamDistance += 0.1;
        dataMap.setDouble("beamDistance", beamDistance, 0);
        rebuildBeam(entity, baseCollector, beamCollector, dataMap);
    }

    //ワイヤー式ビームの余長を0.1m減らす
    if (keyManager.pressed("beamDistanceDecrease") || keyManager.held("beamDistanceDecrease", 500)) {
        beamDistance = Math.max(0, beamDistance - 0.1);
        dataMap.setDouble("beamDistance", beamDistance, 0);
        rebuildBeam(entity, baseCollector, beamCollector, dataMap);
    }
}

//#################
//##  パーツ登録  ##
//#################
var body: Parts;
var point_rail: Parts;
var selected_block: Parts;
var pole: Parts;
var beam: Parts;

function initParts(): void {
    body = renderer.registerParts(new Parts("body"));
    point_rail = renderer.registerParts(new Parts("point_rail"));
    selected_block = renderer.registerParts(new Parts("selected_block"));
    pole = renderer.registerParts(new Parts("pole"));
    beam = renderer.registerParts(new Parts("beam"));
}

//############
//##  描画  ##
//############
function renderForToolUser(entity: EntityVehicle, pass: number, par3: number): void {
    const dataMap = entity.getResourceState().getDataMap();
    const lookingPos = NGTOBuilderUtilClient.getLookingPos();
    const posX = MCWrapper.getPosX(entity);
    const posY = MCWrapper.getPosY(entity);
    const posZ = MCWrapper.getPosZ(entity);

    let baseCollector = baseCollectorCache.get(entity);
    if (!baseCollector) {
        baseCollector = new InsulatorCollector();
        baseCollectorCache.put(entity, baseCollector);
    }

    let beamCollector = beamCollectorCache.get(entity);
    if (!beamCollector) {
        beamCollector = new InsulatorCollector();
        beamCollectorCache.put(entity, beamCollector);
    }

    // レールカーソルだけ表示する
    if (lookingPos) {
        const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.posX, lookingPos.posY, lookingPos.posZ);
        if (lookingRailMap) {
            const split = Math.floor(lookingRailMap.getLength() * 2);
            const rmIndex = lookingRailMap.getNearlestPoint(split, lookingPos.posX, lookingPos.posZ);
            const rmPosZX = lookingRailMap.getRailPos(split, rmIndex);
            const rmPosY = lookingRailMap.getRailHeight(split, rmIndex);
            let rmYaw = lookingRailMap.getRailYaw(split, rmIndex);
            if (keyManager.downOptionKey()) rmYaw += 180;

            GL11.glPushMatrix();
            GL11.glTranslatef(rmPosZX[1], rmPosY, rmPosZX[0]);
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glRotatef(rmYaw, 0, 1, 0);
            point_rail.render(renderer);
            GL11.glPopMatrix();
        }
    }

    // ビーム設置の碍子設置位置のブロック座標プレビュー
    if (beamCollector.size(entity) > 0) {
        const beamPosList = beamCollector.getAll(entity);
        const renderOffsetY = dataMap.getBoolean("isBeamInsulatorMode") ? 0 : -5;//碍子を空中に置くか地面に置くか

        for (let i = 0; i < beamPosList.length; i = i + 2) {
            const startPos = beamPosList[i];
            const endPos = beamPosList[i + 1];
            if (!startPos || !endPos) continue;

            const startX = startPos[0] + 0.5 + startPos[4];
            const startY = startPos[1] + 0.5 + startPos[5];
            const startZ = startPos[2] + 0.5 + startPos[6];

            const endX = endPos[0] + 0.5 + endPos[4];
            const endY = endPos[1] + 0.5 + endPos[5];
            const endZ = endPos[2] + 0.5 + endPos[6];

            // ビームワイヤーの簡易プレビュー
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            renderWire([startX, startY + (5.5 + renderOffsetY), startZ], [endX, endY + (5.5 + renderOffsetY), endZ], beam);
            GL11.glPopMatrix();

            GL11.glPushMatrix();
            GL11.glTranslatef(startX, startY + renderOffsetY, startZ);
            GL11.glTranslatef(-posX, -posY, -posZ);
            pole.render(renderer);
            GL11.glPopMatrix();

            GL11.glPushMatrix();
            GL11.glTranslatef(endX, endY + renderOffsetY, endZ);
            GL11.glTranslatef(-posX, -posY, -posZ);
            pole.render(renderer);
            GL11.glPopMatrix();

            renderBlockPreview(startX, startY, startZ, posX, posY, posZ);
            renderBlockPreview(endX, endY, endZ, posX, posY, posZ);
        }
    }
}

function renderBlockPreview(x: number, y: number, z: number, entityX: number, entityY: number, entityZ: number): void {
    GL11.glPushMatrix();
    GL11.glTranslatef(
        Math.floor(x) + 0.5,
        Math.floor(y) + 0.5,
        Math.floor(z) + 0.5
    );
    GL11.glTranslatef(-entityX, -entityY, -entityZ);
    selected_block.render(renderer);
    GL11.glPopMatrix();
}

function renderInMenu(): void {
    body.render(renderer);
}

function render(entity: EntityVehicle, pass: number, par3: number): void {
    renderInMenu();
    if (!entity) return;

    const dataMap = entity.getResourceState().getDataMap();
    const isOpenGUI = NGTUtilClient.getMinecraft().currentScreen !== null;
    const world = entity.worldObj;
    const player = MCWrapperClient.getPlayer();
    const hostPlayerEntityId = dataMap.getString("hostPlayerEntityId");

    let hostPlayer = null;
    if (hostPlayerEntityId !== "") hostPlayer = world.getEntityByID(Number(hostPlayerEntityId)) as EntityPlayer;

    if (hostPlayer === null) {
        dataMap.setBoolean("showHelpMessage", false, 0);
        return;
    }

    const sender = hostPlayer as unknown as ICommandSender;
    const isLeftClick = Mouse.isButtonDown(0);
    const isRightClick = Mouse.isButtonDown(1);
    const prevIsLeftClick = dataMap.getBoolean("prevIsLeftClick");
    const prevIsRightClick = dataMap.getBoolean("prevIsRightClick");
    const VERSIONS_server = dataMap.getString("VERSIONS");
    const isVersionChecked = dataMap.getBoolean("isVersionChecked");

    RTMApiCompat.doFollowing(entity, hostPlayer);

    if (hostPlayer && hostPlayer === player) {
        if (isLeftClick !== prevIsLeftClick) dataMap.setBoolean("prevIsLeftClick", isLeftClick, 0);
        if (isRightClick !== prevIsRightClick) dataMap.setBoolean("prevIsRightClick", isRightClick, 0);
        if (renderer.currentMatId === 0 && pass === 0) keyManager.update();

        if ((VERSIONS_server != Version) && !isVersionChecked) {
            dataMap.setBoolean("isVersionChecked", true, 0);
            NGTLog.sendChatMessage(sender, "§cVersions don't match!");
            NGTLog.sendChatMessage(sender, "§cClient:" + Version);
            NGTLog.sendChatMessage(sender, "§cServer:" + VERSIONS_server);
        }

        const showHelpMessage = dataMap.getBoolean("showHelpMessage");
        if (!showHelpMessage) {
            dataMap.setBoolean("showHelpMessage", true, 0);
            NGTLog.sendChatMessage(sender, keyManager.getDescription("showHelp"));
        }

        if (!isOpenGUI && pass === 0 && renderer.currentMatId === 0) {
            keyInput(hostPlayer, entity, (!prevIsRightClick && isRightClick), (!prevIsLeftClick && isLeftClick));
        }

        renderForToolUser(entity, pass, par3);
    }
    else {
        if (!prevIsLeftClick) dataMap.setBoolean("prevIsLeftClick", true, 0);
        if (!prevIsRightClick) dataMap.setBoolean("prevIsRightClick", true, 0);
    }
}

//追加関数
function getBeamInsulatorName(player: EntityPlayer): string {
    const insulatorItems = getItemInsulators(player);
    return insulatorItems.length > 0 ? insulatorItems[insulatorItems.length - 1].getTagCompound().getString("ModelName") : "NoModel_Side";
}

function getItemInsulators(player: EntityPlayer): ItemStack[] {
    const list: ItemStack[] = [];
    for (let i = 0; i <= 8; i++) {
        const itemStack = RTMApiCompat.getItemStackAt(player.inventory, i);
        if (itemStack && itemStack.getItem() instanceof ItemInstalledObject && RTMApiCompat.getSubType(itemStack) === "Relay") {
            list.push(itemStack);
        }
    }
    return list;
}

function getBeamWire(player: EntityPlayer): ItemStack | null {
    for (let i = 8; i >= 0; i--) {
        const itemStack = RTMApiCompat.getItemStackAt(player.inventory, i);
        if (itemStack && itemStack.getItem() === RTMItem.itemWire) {
            return itemStack;
        }
    }
    return null;
}

function renderWire(pos1: [number, number, number], pos2: [number, number, number], parts: Parts): void {
    const vec = new Vec3(pos2[0] - pos1[0], pos2[1] - pos1[1], pos2[2] - pos1[2]);
    const scale = vec.length();
    const yaw = vec.getYaw();
    const pitch = vec.getPitch();

    GL11.glPushMatrix();
    GL11.glTranslatef(pos1[0], pos1[1], pos1[2]);
    GL11.glRotatef(yaw, 0, 1, 0);
    GL11.glRotatef(-pitch, 1, 0, 0);
    GL11.glScalef(1, 1, scale);
    parts.render(renderer);
    GL11.glPopMatrix();
}

function rebuildBeam(entity: EntityVehicle, baseCollector: InsulatorCollector, beamCollector: InsulatorCollector, dataMap: DataMap): void {
    const laneCount = dataMap.getInt("laneCount");
    const laneDistance = dataMap.getDouble("laneDistance");
    const beamDistance = dataMap.getDouble("beamDistance");
    const isBeamInsulatorMode = dataMap.getBoolean("isBeamInsulatorMode");

    beamCollector.clear(entity);

    const beamMargin = beamDistance + 3;
    const outerLaneDeviation = laneDistance * Math.abs(laneCount) * (laneCount > 0 ? -1 : 1);
    const beamLeft = Math.min(0, outerLaneDeviation) - beamMargin;
    const beamRight = Math.max(0, outerLaneDeviation) + beamMargin;

    const baseList = baseCollector.getAll(entity);

    for (let i = 0; i < baseList.length; i++) {
        const pos = baseList[i];
        const yaw = pos[7];

        let deviationVecLeft = new Vec3(beamLeft, 0, 0);
        let deviationVecRight = new Vec3(beamRight, 0, 0);
        deviationVecLeft = deviationVecLeft.rotateAroundY(yaw);
        deviationVecRight = deviationVecRight.rotateAroundY(yaw);

        const baseX = pos[0] + 0.5 + pos[4];
        const baseY = pos[1] + 0.5 + pos[5];
        const baseZ = pos[2] + 0.5 + pos[6];

        const groundY = pos[1] - 4.5;
        const insulatorY = !isBeamInsulatorMode ? baseY : groundY;

        beamCollector.add(entity, baseX + deviationVecLeft.getX(), insulatorY, baseZ + deviationVecLeft.getZ(), pos[3], pos[7]);
        beamCollector.add(entity, baseX + deviationVecRight.getX(), insulatorY, baseZ + deviationVecRight.getZ(), pos[3], pos[7]);
    }
}
