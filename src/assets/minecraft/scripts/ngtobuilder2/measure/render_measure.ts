import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapper, MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ModelSetVehicle } from "jp.ngt.rtm.modelpack.modelset";
import { ModelObject, Parts, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { ICommandSender } from "net.minecraft.command";
import { EntityPlayer } from "net.minecraft.entity.player";
import { Keyboard, Mouse } from "org.lwjgl.input";
import { NGTOBuilderUtilClient, Pos } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtilClient";
import { RTMApiCompat } from "../../lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { GL11 } from "org.lwjgl.opengl";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { BezierControlPoints, BezierCurve3D } from "../../lib_hi03toolkit_1_0/lib_BezierCurve3D";
import { InputManager } from "../../lib_hi03toolkit_1_0/lib_InputManager";
import { ItemInstalledObject } from "jp.ngt.rtm.item";
import { ItemStack } from "net.minecraft.item";
import { RTMItem } from "jp.ngt.rtm";
import { Vec3 } from "jp.ngt.ngtlib.math";
import { PositionCollector } from "../../lib_hi03toolkit_1_0/lib_PositionCollector";
import { ReceiveData_measure } from "./server_measure";
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
    keyManager.register("build", Keyboard.KEY_RETURN, true, "生成する");
    keyManager.register("cancelBuild", Keyboard.KEY_BACK, true, "生成を中止する");
    keyManager.register("undo", Keyboard.KEY_Z, true, "Undo");
    keyManager.register("markerFix", Keyboard.KEY_RETURN, false, "マーカーを地上に設置する");

    //ーーカーソル操作ーー
    keyManager.register("resetSelected", Keyboard.KEY_C, false, "すべての選択をリセットする");

    //-------------------
    //--  ユーザー設定  --
    //-------------------
    posCollector = new PositionCollector();
    initParts();
}
var posCollector: PositionCollector;
var keyManager: InputManager;
var Version: string;

function keyInput(hostPlayer: EntityPlayer, entity: EntityVehicle, isRightClick: boolean, isLeftClick: boolean): void {
    const sender = hostPlayer as unknown as ICommandSender;
    const dataMap = entity.getResourceState().getDataMap();
    const lookingPos = NGTOBuilderUtilClient.getLookingPos();
    const world = entity.worldObj;

    const isReset = dataMap.getBoolean("isReset");

    //保存したデータが有れば復元する
    const savedSelectedPosListData = dataMap.getString("selectedPosList");
    const savedSelectedPosList: Pos[] = savedSelectedPosListData ? JSON.parse(savedSelectedPosListData.replace(/☆/g, ",")) : [];
    if (!isReset && savedSelectedPosList.length > 0 && posCollector.size(entity) === 0) {
        dataMap.setBoolean("isReset", true, 1);
        for (let i = 0; i < savedSelectedPosList.length; i++) {
            const pos = savedSelectedPosList[i];
            posCollector.add(entity, pos[0], pos[1], pos[2]);
        }
    }

    if (keyManager.pressed("showHelp")) {
        NGTLog.sendChatMessage(sender, `---NGTO Builder2 ライン設置 操作方法---`);
        //ーー共通ーー
        NGTLog.sendChatMessage(sender, keyManager.getDescription("endEdit"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("build"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("cancelBuild"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("undo"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("markerFix"));
        //ーーカーソル操作ーー
        NGTLog.sendChatMessage(sender, `---カーソル操作---`);
        NGTLog.sendChatMessage(sender, `[右クリック] 座標を選択`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyManager.getOptionKeyCode())} + 右クリック] 座標を選択(スナップ)`);
        NGTLog.sendChatMessage(sender, `[左クリック] 最後の選択を解除`);
        NGTLog.sendChatMessage(sender, keyManager.getDescription("resetSelected"));
    }

    //終了
    if (keyManager.down("endEdit")) {
        dataMap.setBoolean("isEndEdit", true, 1);
    }

    //生成
    const heldBlock = NGTOBuilderUtil.getHeldBlockSet(hostPlayer);
    const isBuilding = dataMap.getBoolean("isBuilding");
    const isUndo = dataMap.getBoolean("isUndo");
    if (keyManager.pressed("build") && posCollector.size(entity) > 1 && heldBlock && !isUndo && !isBuilding) {
        dataMap.setBoolean("isBuilding", true, 1);
        const points: BezierControlPoints[] = [];
        const posList = posCollector.getAll(entity);
        for (let i = 0; i < posList.length - 1; i++) {
            const sPos = posList[i];
            const ePos = posList[i + 1];
            const cPos = BezierCurve3D.lerpPoint(sPos, ePos, 0.5);
            points.push(new BezierCurve3D(sPos, cPos, ePos).getControlPoints());
        }
        //送信
        const sendData: ReceiveData_measure = {
            bezierList: points
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

    //マーカーを地上に設置する
    if (keyManager.pressed("markerFix")) {
        dataMap.setBoolean("isMarkerFix", true, 1);
        dataMap.setString("hostPlayerEntityId", "", 3);

        //選択済み座標をJSON化→setStringで保存
        syncSelectedPosList(entity);

        posCollector.clear(entity);
    }

    //座標を追加
    if (lookingPos && isRightClick) {
        const isSnap = keyManager.downOptionKey();
        const lookingPosX = isSnap ? Math.round(lookingPos.posX * 2) / 2 : lookingPos.posX;
        const lookingPosY = isSnap ? Math.round(lookingPos.posY * 2) / 2 : lookingPos.posY;
        const lookingPosZ = isSnap ? Math.round(lookingPos.posZ * 2) / 2 : lookingPos.posZ;
        posCollector.add(entity, lookingPosX, lookingPosY, lookingPosZ);
        syncSelectedPosList(entity);
    }

    //選択を解除
    if (isLeftClick) {
        posCollector.pop(entity);
        syncSelectedPosList(entity);
    }

    //すべての選択をリセットする
    if (keyManager.pressed("resetSelected")) {
        posCollector.clear(entity);
        syncSelectedPosList(entity);
    }
}

//#################
//##  パーツ登録  ##
//#################
//## グローバル変数として使うための準備 ##
var body: Parts;
var body_dismount: Parts;
var point: Parts;
var selected: Parts;
var distanceNum: Parts[];
var distance_M: Parts;
var distance_SUM: Parts;
var distance_ANGLE: Parts;
var distance_DECIMAL: Parts;
var distance_L: Parts;
var distance_COLON: Parts;
var line: Parts;
var line_selected: Parts;
var scale1: Parts;
var scale1_selected: Parts;
var scale10: Parts;
var scale10_selected: Parts;
var blockFrame: Parts;
function initParts(): void {
    //## 描画パーツの設定 ##
    body = renderer.registerParts(new Parts("body"));
    body_dismount = renderer.registerParts(new Parts("body_dismount"));
    point = renderer.registerParts(new Parts("point"));
    selected = renderer.registerParts(new Parts("selected"));
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
    distance_SUM = renderer.registerParts(new Parts("distance_SUM"));
    distance_ANGLE = renderer.registerParts(new Parts("distance_ANGLE"));
    distance_L = renderer.registerParts(new Parts("distance_L"));
    distance_COLON = renderer.registerParts(new Parts("distance_COLON"));
    distance_DECIMAL = renderer.registerParts(new Parts("distance_DECIMAL"));
    line = renderer.registerParts(new Parts("line"));
    line_selected = renderer.registerParts(new Parts("line_selected"));
    scale1 = renderer.registerParts(new Parts("scale1"));
    scale1_selected = renderer.registerParts(new Parts("scale1_selected"));
    scale10 = renderer.registerParts(new Parts("scale10"));
    scale10_selected = renderer.registerParts(new Parts("scale10_selected"));
    blockFrame = renderer.registerParts(new Parts("blockFrame"));
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

    //本体
    body.render(renderer);

    //カーソル
    if (lookingPos) {
        const posList = posCollector.getAll(entity);
        const isSnap = keyManager.downOptionKey();
        const lookingPosX = isSnap ? Math.round(lookingPos.posX * 2) / 2 : lookingPos.posX;
        const lookingPosY = isSnap ? Math.round(lookingPos.posY * 2) / 2 : lookingPos.posY;
        const lookingPosZ = isSnap ? Math.round(lookingPos.posZ * 2) / 2 : lookingPos.posZ;

        //ポイント
        GL11.glPushMatrix();
        GL11.glTranslatef(-posX, -posY, -posZ);
        GL11.glTranslatef(lookingPosX, lookingPosY, lookingPosZ);
        point.render(renderer);
        GL11.glPopMatrix();

        //ブロックフレーム
        if (isSnap) {
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glTranslatef(lookingPos.blockX + 0.5, lookingPos.blockY + 0.5, lookingPos.blockZ + 0.5);
            blockFrame.render(renderer);
            GL11.glPopMatrix();
        }

        //メジャー
        if (posList.length > 0) {
            const prevPos = posList[posList.length - 1];
            const distanceVec = new Vec3(lookingPosX - prevPos[0], lookingPosY - prevPos[1], lookingPosZ - prevPos[2]);
            const distance = distanceVec.length();
            const yaw = distanceVec.getYaw();
            const pitch = distanceVec.getPitch();
            const toPlayerVec = new Vec3(player.posX - lookingPosX, player.posY - lookingPosY, player.posZ - lookingPosZ);
            const toPlayerYaw = toPlayerVec.getYaw();

            //総距離
            let totalDistance = distance;
            for (let i = 0; i < posList.length - 1; i++) {
                const pos1 = posList[i];
                const pos2 = posList[i + 1];
                const vec = new Vec3(pos2[0] - pos1[0], pos2[1] - pos1[1], pos2[2] - pos1[2]);
                totalDistance += vec.length();
            }

            //線を描画
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            renderWire(prevPos, [lookingPosX, lookingPosY, lookingPosZ], line);
            GL11.glPopMatrix();

            //スケールを描画
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glTranslatef(prevPos[0], prevPos[1], prevPos[2]);
            GL11.glRotatef(yaw, 0, 1, 0);
            GL11.glRotatef(-pitch, 1, 0, 0);
            for (let i = 0; i <= Math.floor(distance); i++) {
                //10m単位
                if (i % 10 === 0) {
                    scale10.render(renderer);
                    GL11.glTranslatef(0, 0, 1);
                }
                //1m単位
                else {
                    scale1.render(renderer);
                    GL11.glTranslatef(0, 0, 1);
                }
            }
            GL11.glPopMatrix();

            //距離の文字列を描画(直前の点からの距離)
            const distanceStr = "L:" + distance.toFixed(1) + "m";
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glTranslatef(lookingPosX, lookingPosY, lookingPosZ);
            GL11.glRotatef(toPlayerYaw + 180, 0, 1, 0);
            for (let i = 0; i < distanceStr.length; i++) {
                const char = distanceStr.charAt(i);
                if (char >= "0" && char <= "9") distanceNum[Number(char)].render(renderer);
                else if (char === ".") distance_DECIMAL.render(renderer);
                else if (char === "m") distance_M.render(renderer);
                else if (char === ":") distance_COLON.render(renderer);
                else if (char === "L") distance_L.render(renderer);
                GL11.glTranslatef(-1, 0, 0);
            }
            GL11.glPopMatrix();

            //総距離の文字列を描画
            const totalDistanceStr = "S:" + totalDistance.toFixed(1) + "m";
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glTranslatef(lookingPosX, lookingPosY + 1.2, lookingPosZ);
            GL11.glRotatef(toPlayerYaw + 180, 0, 1, 0);
            for (let i = 0; i < totalDistanceStr.length; i++) {
                const char = totalDistanceStr.charAt(i);
                if (char >= "0" && char <= "9") distanceNum[Number(char)].render(renderer);
                else if (char === ".") distance_DECIMAL.render(renderer);
                else if (char === "m") distance_M.render(renderer);
                else if (char === ":") distance_COLON.render(renderer);
                else if (char === "S") distance_SUM.render(renderer);
                GL11.glTranslatef(-1, 0, 0);
            }
            GL11.glPopMatrix();
        }
    }

    //選択済みの点を描画
    const posList = posCollector.getAll(entity);
    let totalDistance = 0;
    for (let i = 0; i < posList.length - 1; i++) {
        const pos1 = posList[i];
        const pos2 = posList[i + 1];
        const vec = new Vec3(pos2[0] - pos1[0], pos2[1] - pos1[1], pos2[2] - pos1[2]);
        totalDistance += vec.length();
    }
    for (let i = 0; i < posList.length; i++) {
        //ポイント
        const pos = posList[i];
        GL11.glPushMatrix();
        GL11.glTranslatef(-posX, -posY, -posZ);
        GL11.glTranslatef(pos[0], pos[1], pos[2]);
        selected.render(renderer);
        GL11.glPopMatrix();

        //メジャー
        if (i < posList.length - 1) {
            const nextPos = posList[i + 1];

            //線を描画
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            renderWire(pos, nextPos, line_selected);
            GL11.glPopMatrix();

            //スケールを描画
            const vec = new Vec3(nextPos[0] - pos[0], nextPos[1] - pos[1], nextPos[2] - pos[2]);
            const distance = vec.length();
            const yaw = vec.getYaw();
            const pitch = vec.getPitch();
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glTranslatef(pos[0], pos[1], pos[2]);
            GL11.glRotatef(yaw, 0, 1, 0);
            GL11.glRotatef(-pitch, 1, 0, 0);
            for (let j = 0; j <= Math.floor(distance); j++) {
                //10m単位
                if (j % 10 === 0) {
                    scale10_selected.render(renderer);
                    GL11.glTranslatef(0, 0, 1);
                }
                //1m単位
                else {
                    scale1_selected.render(renderer);
                    GL11.glTranslatef(0, 0, 1);
                }
            }
            GL11.glPopMatrix();

            //距離の文字列を描画(次の点までの距離) 文字は2点の中央に配置する
            const distanceStr = "L:" + distance.toFixed(1) + "m";
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glTranslatef((pos[0] + nextPos[0]) / 2, (pos[1] + nextPos[1]) / 2 + 0.5, (pos[2] + nextPos[2]) / 2);
            GL11.glRotatef(yaw + 90, 0, 1, 0);
            GL11.glRotatef(-pitch, 0, 0, 1);
            GL11.glTranslatef(1.0 + (distanceStr.length * 0.5), 0, 0);
            for (let j = 0; j < distanceStr.length; j++) {
                const char = distanceStr.charAt(j);
                if (char >= "0" && char <= "9") distanceNum[Number(char)].render(renderer);
                else if (char === ".") distance_DECIMAL.render(renderer);
                else if (char === "m") distance_M.render(renderer);
                else if (char === ":") distance_COLON.render(renderer);
                else if (char === "L") distance_L.render(renderer);
                GL11.glTranslatef(-1, 0, 0);
            }
            GL11.glPopMatrix();

            //総距離の文字列を描画
            const totalDistanceStr = "S:" + totalDistance.toFixed(1) + "m";
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glTranslatef((pos[0] + nextPos[0]) / 2, (pos[1] + nextPos[1]) / 2 + 1.7, (pos[2] + nextPos[2]) / 2);
            GL11.glRotatef(yaw + 90, 0, 1, 0);
            GL11.glRotatef(-pitch, 0, 0, 1);
            GL11.glTranslatef(1.0 + (totalDistanceStr.length * 0.5), 0, 0);
            for (let j = 0; j < totalDistanceStr.length; j++) {
                const char = totalDistanceStr.charAt(j);
                if (char >= "0" && char <= "9") distanceNum[Number(char)].render(renderer);
                else if (char === ".") distance_DECIMAL.render(renderer);
                else if (char === "m") distance_M.render(renderer);
                else if (char === ":") distance_COLON.render(renderer);
                else if (char === "S") distance_SUM.render(renderer);
                GL11.glTranslatef(-1, 0, 0);
            }
            GL11.glPopMatrix();
        }
    }
}

//他のプレイヤーに描画する
function renderForOtherUser(entity: EntityVehicle, pass: number, par3: number): void {
    const dataMap = entity.getResourceState().getDataMap();
    const posX = MCWrapper.getPosX(entity);
    const posY = MCWrapper.getPosY(entity);
    const posZ = MCWrapper.getPosZ(entity);
    const posListData = dataMap.getString("selectedPosList");
    const posList: Pos[] = posListData ? JSON.parse(posListData.replace(/☆/g, ",")) : [];

    //本体
    if (posList.length > 0) body_dismount.render(renderer);
    else body.render(renderer);

    //選択済みの点を描画
    let totalDistance = 0;
    for (let i = 0; i < posList.length - 1; i++) {
        const pos1 = posList[i];
        const pos2 = posList[i + 1];
        const vec = new Vec3(pos2[0] - pos1[0], pos2[1] - pos1[1], pos2[2] - pos1[2]);
        totalDistance += vec.length();
    }
    for (let i = 0; i < posList.length; i++) {
        //ポイント
        const pos = posList[i];
        GL11.glPushMatrix();
        GL11.glTranslatef(-posX, -posY, -posZ);
        GL11.glTranslatef(pos[0], pos[1], pos[2]);
        selected.render(renderer);
        GL11.glPopMatrix();

        //メジャー
        if (i < posList.length - 1) {
            const nextPos = posList[i + 1];

            //線を描画
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            renderWire(pos, nextPos, line_selected);
            GL11.glPopMatrix();

            //スケールを描画
            const vec = new Vec3(nextPos[0] - pos[0], nextPos[1] - pos[1], nextPos[2] - pos[2]);
            const distance = vec.length();
            const yaw = vec.getYaw();
            const pitch = vec.getPitch();
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glTranslatef(pos[0], pos[1], pos[2]);
            GL11.glRotatef(yaw, 0, 1, 0);
            GL11.glRotatef(-pitch, 1, 0, 0);
            for (let j = 0; j <= Math.floor(distance); j++) {
                //10m単位
                if (j % 10 === 0) {
                    scale10_selected.render(renderer);
                    GL11.glTranslatef(0, 0, 1);
                }
                //1m単位
                else {
                    scale1_selected.render(renderer);
                    GL11.glTranslatef(0, 0, 1);
                }
            }
            GL11.glPopMatrix();

            //距離の文字列を描画(次の点までの距離) 文字は2点の中央に配置する
            const distanceStr = "L:" + distance.toFixed(1) + "m";
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glTranslatef((pos[0] + nextPos[0]) / 2, (pos[1] + nextPos[1]) / 2 + 0.5, (pos[2] + nextPos[2]) / 2);
            GL11.glRotatef(yaw + 90, 0, 1, 0);
            GL11.glRotatef(-pitch, 0, 0, 1);
            GL11.glTranslatef(1.0 + (distanceStr.length * 0.5), 0, 0);
            for (let j = 0; j < distanceStr.length; j++) {
                const char = distanceStr.charAt(j);
                if (char >= "0" && char <= "9") distanceNum[Number(char)].render(renderer);
                else if (char === ".") distance_DECIMAL.render(renderer);
                else if (char === "m") distance_M.render(renderer);
                else if (char === ":") distance_COLON.render(renderer);
                else if (char === "L") distance_L.render(renderer);
                GL11.glTranslatef(-1, 0, 0);
            }
            GL11.glPopMatrix();

            //総距離の文字列を描画
            const totalDistanceStr = "S:" + totalDistance.toFixed(1) + "m";
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glTranslatef((pos[0] + nextPos[0]) / 2, (pos[1] + nextPos[1]) / 2 + 1.7, (pos[2] + nextPos[2]) / 2);
            GL11.glRotatef(yaw + 90, 0, 1, 0);
            GL11.glRotatef(-pitch, 0, 0, 1);
            GL11.glTranslatef(1.0 + (totalDistanceStr.length * 0.5), 0, 0);
            for (let j = 0; j < totalDistanceStr.length; j++) {
                const char = totalDistanceStr.charAt(j);
                if (char >= "0" && char <= "9") distanceNum[Number(char)].render(renderer);
                else if (char === ".") distance_DECIMAL.render(renderer);
                else if (char === "m") distance_M.render(renderer);
                else if (char === ":") distance_COLON.render(renderer);
                else if (char === "S") distance_SUM.render(renderer);
                GL11.glTranslatef(-1, 0, 0);
            }
            GL11.glPopMatrix();
        }
    }
}

//本体の描画(モデル選択と画面併用)
function renderInMenu(): void {
    body.render(renderer);
}

//#################################
//#################################
function render(entity: EntityVehicle, pass: number, par3: number): void {
    if (!entity) {
        renderInMenu();
        return;
    }
    const dataMap = entity.getResourceState().getDataMap();
    const isOpenGUI = NGTUtilClient.getMinecraft().currentScreen !== null;
    const world = entity.worldObj;
    const player = MCWrapperClient.getPlayer();
    const hostPlayerEntityId = dataMap.getString("hostPlayerEntityId");
    let hostPlayer = null;
    if (hostPlayerEntityId !== "") hostPlayer = world.getEntityByID(Number(hostPlayerEntityId)) as EntityPlayer;
    const prevIsLeftClick = dataMap.getBoolean("prevIsLeftClick");
    const prevIsRightClick = dataMap.getBoolean("prevIsRightClick");
    if (hostPlayer === null) {
        dataMap.setBoolean("showHelpMessage", false, 0);
        if (!prevIsLeftClick) dataMap.setBoolean("prevIsLeftClick", true, 0);
        if (!prevIsRightClick) dataMap.setBoolean("prevIsRightClick", true, 0);
        renderForOtherUser(entity, pass, par3);
        return;
    }
    const sender = hostPlayer as unknown as ICommandSender;
    const isLeftClick = Mouse.isButtonDown(0);
    const isRightClick = Mouse.isButtonDown(1);
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
}

//追加関数
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

function syncSelectedPosList(entity: EntityVehicle): void {
    const dataMap = entity.getResourceState().getDataMap();
    const posList = posCollector.getAll(entity);
    const jsonPosList = JSON.stringify(posList).replace(/,/g, "☆");
    dataMap.setString("selectedPosList", jsonPosList, 3);
}