import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapper, MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ModelSetConnectorClient, ModelSetVehicle, ModelSetWireClient } from "jp.ngt.rtm.modelpack.modelset";
import { ModelObject, Parts, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { ICommandSender } from "net.minecraft.command";
import { EntityPlayer } from "net.minecraft.entity.player";
import { Keyboard, Mouse } from "org.lwjgl.input";
import { NGTOBuilderUtilClient, Pos } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtilClient";
import { RTMApiCompat } from "../../lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { GL11 } from "org.lwjgl.opengl";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { BezierCollector } from "../../lib_hi03toolkit_1_0/lib_BezierCollector";
import { BezierCurve3D } from "../../lib_hi03toolkit_1_0/lib_BezierCurve3D";
import { InputManager } from "../../lib_hi03toolkit_1_0/lib_InputManager";
import { InsulatorCollector } from "../../lib_hi03toolkit_1_0/lib_InsulatorCollector";
import { ReceiveData_wire } from "./server_wire";
import { ItemInstalledObject } from "jp.ngt.rtm.item";
import { Item, ItemStack } from "net.minecraft.item";
import { RTMItem } from "jp.ngt.rtm";
import { RTMApiCompatClient } from "../../lib_hi03toolkit_1_0/lib_RTMApiCompatClient";
import { HashMap } from "java.util";
import { Connection, TileEntityInsulator } from "jp.ngt.rtm.electric";
import { Vec3 } from "jp.ngt.ngtlib.math";
declare const renderer: VehiclePartsRenderer;

//##  NGTO Builder2 Prop設置  ##

//initに設定するグローバル関数の宣言
function init(par1: ModelSetVehicle, par2: ModelObject): void {
    keyManager = new InputManager();

    //バージョン
    Version = "1.0";
    // v1.0 初回リリース

    //###################
    //##  ユーザー設定  ##
    //###################

    //ーー共通ーー
    keyManager.setOptionKey(Keyboard.KEY_LCONTROL);//オプションキー
    keyManager.register("showHelp", Keyboard.KEY_H, false, "ヘルプを表示");
    keyManager.register("endEdit", Keyboard.KEY_Q, false, "ツールを終了");
    keyManager.register("build", Keyboard.KEY_RETURN, false, "生成する");
    keyManager.register("cancelBuild", Keyboard.KEY_BACK, true, "生成を中止する");
    keyManager.register("undo", Keyboard.KEY_Z, true, "Undo");
    //ーーカーソル操作ーー
    keyManager.register("resetSelected", Keyboard.KEY_C, false, "すべての選択をリセットする");
    keyManager.register("reverseMarker", Keyboard.KEY_P, false, "マーカーを反転する");
    //ーー機能ーー
    keyManager.register("isDeviation", Keyboard.KEY_O, false, "架線偏位を切り替える");
    keyManager.register("isDeviationInvert", Keyboard.KEY_O, true, "架線偏位の左右を入れ替える");
    keyManager.register("isBeamWire", Keyboard.KEY_I, false, "ワイヤー式ビーム設置の切り替え");
    //ーー架線操作ーー
    keyManager.register("laneLeft", Keyboard.KEY_LEFT, false, "左にレーンを増やす/右のレーンを減らす");
    keyManager.register("laneRight", Keyboard.KEY_RIGHT, false, "右にレーンを増やす/左のレーンを減らす");
    keyManager.register("laneDistanceUp", Keyboard.KEY_LEFT, true, "レーン間の距離を増やす");
    keyManager.register("laneDistanceDown", Keyboard.KEY_RIGHT, true, "レーン間の距離を減らす");
    keyManager.register("beamDistanceIncrease", Keyboard.KEY_UP, false, "ワイヤー式ビームの長さを0.1m増やす");
    keyManager.register("beamDistanceDecrease", Keyboard.KEY_UP, false, "ワイヤー式ビームの長さを0.1m減らす");


    //-------------------
    //--  ユーザー設定  --
    //-------------------
    ignoreItemList = [
        RTMItem.itemWire,
        RTMItem.installedObject
    ]
    posCollector = new InsulatorCollector();
    bezierCollector = new BezierCollector();
    connectionCache = new HashMap();
    initParts();
}
var ignoreItemList: Item[];
var wireModelList: { [name: string]: ModelSetWireClient; }
var connectorModelList: { [name: string]: ModelSetConnectorClient; }
var keyManager: InputManager;
var Version: string;
var posCollector: InsulatorCollector;
var bezierCollector: BezierCollector;
var connectionCache: HashMap<string, Connection>;

function keyInput(hostPlayer: EntityPlayer, entity: EntityVehicle, isRightClick: boolean, isLeftClick: boolean): void {
    const sender = hostPlayer as unknown as ICommandSender;
    const dataMap = entity.getResourceState().getDataMap();
    const lookingPos = NGTOBuilderUtilClient.getLookingPos();
    const world = entity.worldObj;

    if (keyManager.pressed("showHelp")) {
        NGTLog.sendChatMessage(sender, `---NGTO Builder2 ライン設置 操作方法---`);
        //ーー共通ーー
        NGTLog.sendChatMessage(sender, keyManager.getDescription("endEdit"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("build"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("cancelBuild"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("undo"));
        //ーーカーソル操作ーー
        NGTLog.sendChatMessage(sender, `---カーソル操作---`);
        NGTLog.sendChatMessage(sender, `[右クリック] レール上の座標を選択`);
        NGTLog.sendChatMessage(sender, `[左クリック] 最後の選択を解除`);
        NGTLog.sendChatMessage(sender, keyManager.getDescription("resetSelected"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("reverseMarker"));
        //ーー機能ーー
        NGTLog.sendChatMessage(sender, `---機能---`);
        NGTLog.sendChatMessage(sender, keyManager.getDescription("isDeviation"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("isDeviationInvert"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("isBeamWire"));
        //ーー架線操作ーー
        NGTLog.sendChatMessage(sender, `---架線操作---`);
        NGTLog.sendChatMessage(sender, keyManager.getDescription("laneLeft"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("laneRight"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("laneDistanceUp"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("laneDistanceDown"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("beamDistanceIncrease"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("beamDistanceDecrease"));
    }

    //終了
    if (keyManager.down("endEdit")) {
        dataMap.setBoolean("isEndEdit", true, 1);
    }

    //生成
    const isBuilding = dataMap.getBoolean("isBuilding");
    const isUndo = dataMap.getBoolean("isUndo");
    const posList = posCollector.getAll(entity);
    let heldItem: ItemStack | null = NGTOBuilderUtil.getHeldItem(hostPlayer);
    if (heldItem && heldItem.getItem() !== RTMItem.itemWire) heldItem = null;
    if (keyManager.pressed("build") && posList.length > 0 && heldItem && !isUndo && !isBuilding) {
        dataMap.setBoolean("isBuilding", true, 1);
        //送信
        const sendData: ReceiveData_wire = {
            posList: posList
        }
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
    if (lookingPos && isRightClick && (!heldItem || ignoreItemList.indexOf(heldItem.getItem()) === -1)) {
        const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.posX, lookingPos.posY, lookingPos.posZ);
        if (lookingRailMap) {
            const split = Math.floor(lookingRailMap.getLength() * 2);
            const rmIndex = lookingRailMap.getNearlestPoint(split, lookingPos.posX, lookingPos.posZ);
            const rmPosZX = lookingRailMap.getRailPos(split, rmIndex);
            const rmPosY = lookingRailMap.getRailHeight(split, rmIndex);
            const heightOffsetY = rmPosY - Math.floor(rmPosY) - (1 / 16);//勾配Y差分
            const rmYaw = lookingRailMap.getRailYaw(split, rmIndex);
            posCollector.add(entity, rmPosZX[1], Math.floor(rmPosY) + 5.5 + heightOffsetY, rmPosZX[0], 1, rmYaw);

            const size = posCollector.size(entity);
            if (size > 1) {
                const list = posCollector.getAll(entity);
                const prev = list[size - 2];
                const last = list[size - 1];
                const sp: Pos = [prev[0] + 0.5 + prev[4], prev[1] + 0.5 + prev[5], prev[2] + 0.5 + prev[6]];
                const ep: Pos = [last[0] + 0.5 + last[4], last[1] + 0.5 + last[5], last[2] + 0.5 + last[6]];
                const cp = BezierCurve3D.lerpPoint(sp, ep, 0.5);
                bezierCollector.add(entity, new BezierCurve3D(sp, cp, ep));
            }
        }
    }

    //選択を解除
    if (isLeftClick && (!heldItem || ignoreItemList.indexOf(heldItem.getItem()) === -1)) {
        posCollector.pop(entity);
        bezierCollector.pop(entity);
    }

    //すべての選択をリセットする
    if (keyManager.pressed("resetSelected")) {
        posCollector.clear(entity);
        bezierCollector.clear(entity);
    }

    //マーカーを反転する
    if (keyManager.pressed("reverseMarker")) {
        posCollector.reverse(entity);
        bezierCollector.clear(entity);
        const list = posCollector.getAll(entity);
        for (let i = 1; i < list.length; i++) {
            const prev = list[i - 1];
            const last = list[i];
            const sp: Pos = [prev[0] + 0.5 + prev[4], prev[1] + 0.5 + prev[5], prev[2] + 0.5 + prev[6]];
            const ep: Pos = [last[0] + 0.5 + last[4], last[1] + 0.5 + last[5], last[2] + 0.5 + last[6]];
            const cp = BezierCurve3D.lerpPoint(sp, ep, 0.5);
            bezierCollector.add(entity, new BezierCurve3D(sp, cp, ep));
        }
    }

    //架線偏位を切り替える

    //架線偏位の左右を入れ替える

    //ワイヤー式ビーム設置の切り替え

    //左にレーンを増やす/右のレーンを減らす

    //右にレーンを増やす/左のレーンを減らす

    //レーン間の距離を増やす

    //レーン間の距離を減らす

    //ワイヤー式ビームの長さを0.1m増やす

    //ワイヤー式ビームの長さを0.1m減らす

}

//#################
//##  パーツ登録  ##
//#################
//## グローバル変数として使うための準備 ##
var body: Parts;
var line: Parts;
var line_selected: Parts;
var point: Parts;
var point_block: Parts;
var selected: Parts;
var selected_block: Parts;
var selectedLineArrow: Parts;
var point_rail: Parts;
var distanceNum: Parts[];
var distance_M: Parts;
function initParts(): void {
    //## 描画パーツの設定 ##
    body = renderer.registerParts(new Parts("body"));
    point = renderer.registerParts(new Parts("point"));
    point_block = renderer.registerParts(new Parts("point_block"));
    point_rail = renderer.registerParts(new Parts("point_rail"));
    selected = renderer.registerParts(new Parts("selected"));
    selected_block = renderer.registerParts(new Parts("selected_block"));
    selectedLineArrow = renderer.registerParts(new Parts("selectedLineArrow"));
    line = renderer.registerParts(new Parts("line"));
    line_selected = renderer.registerParts(new Parts("line_selected"));
    distanceNum = [];
    distanceNum[0] = renderer.registerParts(new Parts("distance_0"));
    distanceNum[1] = renderer.registerParts(new Parts("distance_1"));
    distanceNum[2] = renderer.registerParts(new Parts("distance_2"));
    distanceNum[3] = renderer.registerParts(new Parts("distance_3"));
    distanceNum[4] = renderer.registerParts(new Parts("distance_4"));
    distanceNum[5] = renderer.registerParts(new Parts("distance_5"));
    distanceNum[6] = renderer.registerParts(new Parts("distance_6"));
    distanceNum[7] = renderer.registerParts(new Parts("distance_7"));
    distanceNum[8] = renderer.registerParts(new Parts("distance_8"));
    distanceNum[9] = renderer.registerParts(new Parts("distance_9"));
    distance_M = renderer.registerParts(new Parts("distance_M"));
}

//############
//##  描画  ##
//############
//使用中のプレイヤーだけに描画されます
function renderForToolUser(entity: EntityVehicle, pass: number, par3: number): void {
    const dataMap = entity.getResourceState().getDataMap();
    const lookingPos = NGTOBuilderUtilClient.getLookingPos();
    const posX = MCWrapper.getPosX(entity);
    const posY = MCWrapper.getPosY(entity);
    const posZ = MCWrapper.getPosZ(entity);
    const player = MCWrapperClient.getPlayer();
    const isBuilding = dataMap.getBoolean("isBuilding");
    const isUndo = dataMap.getBoolean("isUndo");
    const world = entity.worldObj;
    connectorModelList = connectorModelList ? connectorModelList : RTMApiCompatClient.getModelSetList("ModelConnector");
    wireModelList = wireModelList ? wireModelList : RTMApiCompatClient.getModelSetList("ModelWire");

    const insulatorItem = getItemInsulator(player);
    const insulatorName = insulatorItem ? insulatorItem.getTagCompound().getString("ModelName") : "NoModel_Side";
    const insulatorModelSet = connectorModelList[insulatorName];
    const insulatorOffset = insulatorModelSet ? insulatorModelSet.getConfig().wirePos : [0, 0, 0];
    const isFlipModel = insulatorName.toLocaleLowerCase().indexOf("flip") >= 0;

    //カーソル
    if (lookingPos) {
        const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.posX, lookingPos.posY, lookingPos.posZ);
        if (lookingRailMap) {
            const split = Math.floor(lookingRailMap.getLength() * 2);
            const rmIndex = lookingRailMap.getNearlestPoint(split, lookingPos.posX, lookingPos.posZ);
            const rmPosZX = lookingRailMap.getRailPos(split, rmIndex);
            const rmPosY = lookingRailMap.getRailHeight(split, rmIndex);
            const heightOffsetY = rmPosY - Math.floor(rmPosY) - (1 / 16);//勾配Y差分
            const currentPos: Pos = [
                rmPosZX[1] + insulatorOffset[0],
                Math.floor(rmPosY) + 5.5 + heightOffsetY + insulatorOffset[1],
                rmPosZX[0] + insulatorOffset[2]
            ];

            //距離表示
            if (posCollector.size(entity) > 0) {
                const prevPos = posCollector.getLastPos(entity);
                if (prevPos) {
                    const _prevPos: Pos = [
                        prevPos[0] + 0.5 + prevPos[4] + insulatorOffset[0],
                        prevPos[1] + 0.5 + prevPos[5] + insulatorOffset[1],
                        prevPos[2] + 0.5 + prevPos[6] + insulatorOffset[2]
                    ];
                    const dx = currentPos[0] - _prevPos[0];
                    const dy = currentPos[1] - _prevPos[1];
                    const dz = currentPos[2] - _prevPos[2];
                    const distance = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz)).toString();
                    const toPlayerYaw = Math.atan2(posX - currentPos[0], posZ - currentPos[2]) * (180 / Math.PI) + 180;
                    GL11.glPushMatrix();
                    GL11.glTranslatef(rmPosZX[1], rmPosY + 5.5 + heightOffsetY, rmPosZX[0]);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    GL11.glRotatef(toPlayerYaw, 0, 1, 0);
                    for (let i = 0; i < distance.length; i++) {
                        const num = parseInt(distance.charAt(i));
                        GL11.glPushMatrix();
                        GL11.glTranslatef(-i, 0, 0);
                        distanceNum[num].render(renderer);
                        if (i === distance.length - 1) distance_M.render(renderer);
                        GL11.glPopMatrix();
                    }
                    GL11.glPopMatrix();
                }
            }

            //レールカーソル
            GL11.glPushMatrix();
            GL11.glTranslatef(rmPosZX[1], rmPosY, rmPosZX[0]);
            GL11.glTranslatef(-posX, -posY, -posZ);
            point_rail.render(renderer);
            GL11.glPopMatrix();

            //接続ポイント
            GL11.glPushMatrix();
            GL11.glTranslatef(rmPosZX[1], Math.floor(rmPosY) + 5.5 + heightOffsetY, rmPosZX[0]);
            GL11.glTranslatef(-posX, -posY, -posZ);
            point.render(renderer);
            GL11.glPopMatrix();

            //碍子のブロック座標
            GL11.glPushMatrix();
            GL11.glTranslatef(Math.floor(rmPosZX[1]) + 0.5, Math.floor(rmPosY) + 5.5 + heightOffsetY + 0.5, Math.floor(rmPosZX[0]) + 0.5);
            GL11.glTranslatef(-posX, -posY, -posZ);
            point_block.render(renderer);
            GL11.glPopMatrix();

            //前のポイントからのカテナリー描画
            if (posCollector.size(entity) > 0) {
                const prevPos = posCollector.getLastPos(entity);
                if (prevPos) {
                    const _prevPos: Pos = [
                        prevPos[0] + 0.5 + prevPos[4] + insulatorOffset[0],
                        prevPos[1] + 0.5 + prevPos[5] + insulatorOffset[1],
                        prevPos[2] + 0.5 + prevPos[6] + insulatorOffset[2]
                    ];
                    GL11.glPushMatrix();
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    renderWire(
                        [_prevPos[0], _prevPos[1], _prevPos[2]],
                        currentPos,
                        line
                    );
                    GL11.glPopMatrix();
                }
            }
        }
    }

    //選択済み
    //コネクタ
    if (posCollector.size(entity) > 0) {
        const list = posCollector.getAll(entity);
        for (let i = 0; i < list.length; i++) {
            const pos = list[i];
            const renderPos = [
                pos[0] + 0.5 + pos[4] + insulatorOffset[0],
                pos[1] + 0.5 + pos[5] + insulatorOffset[1],
                pos[2] + 0.5 + pos[6] + insulatorOffset[2]
            ];
            const tileEntity = world.getTileEntity(Math.floor(pos[0]), Math.floor(pos[1]), Math.floor(pos[2]));
            if (!(tileEntity instanceof TileEntityInsulator)) {
                //碍子のプレビュー
                GL11.glPushMatrix();
                GL11.glTranslatef(renderPos[0], renderPos[1], renderPos[2]);
                GL11.glTranslatef(-posX, -posY, -posZ);
                if (insulatorModelSet) {
                    applyRotationSide(pos[3]);
                    GL11.glRotatef(pos[7] + (isFlipModel ? 180 : 0), 0, 1, 0);
                    NGTOBuilderUtilClient.enableAlpha(0.3);
                    NGTOBuilderUtilClient.renderModel(renderer, pass, insulatorModelSet.modelObj);
                    NGTOBuilderUtilClient.disableAlpha();
                }
                else selected.render(renderer);
                GL11.glPopMatrix();

                //碍子のブロックのプレビュー
                GL11.glPushMatrix();
                GL11.glTranslatef(Math.floor(pos[0] + 0.5 + pos[4]) + 0.5, Math.floor(pos[1] + 0.5 + pos[5]) + 0.5, Math.floor(pos[2] + 0.5 + pos[6]) + 0.5);
                GL11.glTranslatef(-posX, -posY, -posZ);
                selected_block.render(renderer);
                GL11.glPopMatrix();
            }

            //ワイヤーのプレビュー
            if (i > 0) {
                const prevPos = list[i - 1];
                const prevRenderPos = [
                    prevPos[0] + 0.5 + prevPos[4] + insulatorOffset[0],
                    prevPos[1] + 0.5 + prevPos[5] + insulatorOffset[1],
                    prevPos[2] + 0.5 + prevPos[6] + insulatorOffset[2]
                ];
                GL11.glPushMatrix();
                GL11.glTranslatef(-posX, -posY, -posZ);
                renderWire(
                    [renderPos[0], renderPos[1], renderPos[2]],
                    [prevRenderPos[0], prevRenderPos[1], prevRenderPos[2]],
                    line_selected
                );
                GL11.glPopMatrix();
            }
        }
    }

    //ワイヤーの矢印
    if (bezierCollector.size(entity) > 0) {
        const bezierList = bezierCollector.getAll(entity);
        GL11.glPushMatrix();
        GL11.glTranslatef(-posX, -posY, -posZ);
        for (let i = 0; i < bezierList.length; i++) {
            const bezier = bezierList[i];
            NGTOBuilderUtilClient.renderBezierStatic(renderer, selectedLineArrow, bezier, 10);
        }
        GL11.glPopMatrix();
    }
}

//本体の描画(モデル選択と画面併用)
function renderInMenu(): void {
    body.render(renderer);
}

//#################################
//#################################
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
    RTMApiCompat.doFollowing(entity, hostPlayer);//1.12用
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
        if (!isOpenGUI && pass === 0 && renderer.currentMatId === 0) keyInput(hostPlayer, entity, (!prevIsRightClick && isRightClick), (!prevIsLeftClick && isLeftClick));
        renderForToolUser(entity, pass, par3);
    }
    else {
        if (!prevIsLeftClick) dataMap.setBoolean("prevIsLeftClick", true, 0);
        if (!prevIsRightClick) dataMap.setBoolean("prevIsRightClick", true, 0);
    }
}

//追加関数
function getItemInsulator(player: EntityPlayer): ItemStack | null {
    for (let i = 0; i <= 8; i++) {
        const itemStack = RTMApiCompat.getItemStackAt(player.inventory, i);
        if (itemStack && itemStack.getItem() instanceof ItemInstalledObject && RTMApiCompat.getSubType(itemStack) === "Relay") {
            return itemStack;
        }
    }
    return null;
}

function applyRotationSide(blockSide: number): void {
    switch (blockSide) {
        case 0://下
            GL11.glRotatef(180, 0, 0, 1);
            break;
        case 1://上
            break;
        case 2://北
            GL11.glRotatef(-90, 1, 0, 0);
            break;
        case 3://南
            GL11.glRotatef(90, 1, 0, 0);
            break;
        case 4://西
            GL11.glRotatef(90, 0, 0, 1);
            break;
        case 5://東
            GL11.glRotatef(-90, 0, 0, 1);
            break;
    }
}

function renderWire(pos1: Pos, pos2: Pos, parts: Parts): void {
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