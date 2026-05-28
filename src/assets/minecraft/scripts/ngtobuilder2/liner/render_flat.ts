import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapper, MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ModelSetVehicle } from "jp.ngt.rtm.modelpack.modelset";
import { ModelObject, Parts, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { ICommandSender } from "net.minecraft.command";
import { EntityPlayer } from "net.minecraft.entity.player";
import { Keyboard, Mouse } from "org.lwjgl.input";
import { NGTOBuilderUtilClient, Pos } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtilClient";
import { PositionCollector } from "../../lib_hi03toolkit_1_0/lib_PositionCollector";
import { RTMApiCompat } from "../../lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { GL11 } from "org.lwjgl.opengl";
import { HashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { Quaternion } from "../../lib_hi03toolkit_1_0/lib_Quaternion";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { RailMapCollector } from "../../lib_hi03toolkit_1_0/lib_RailMapCollector";
import { BezierCollector } from "../../lib_hi03toolkit_1_0/lib_BezierCollector";
import { RotatableBlockObject } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObject";
import { BlockDiffusionMode, RotatableBlockObjectMapper } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectMapper";
import { BezierControlPoints } from "../../lib_hi03toolkit_1_0/lib_BezierCurve3D";
import { ReceiveData_liner } from "./server_liner";
import { RotatableBlockObjectFactory } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectFactory";
import { BlockSet } from "jp.ngt.ngtlib.block";
import { Blocks } from "net.minecraft.init";
import { InputManager } from "../../lib_hi03toolkit_1_0/lib_InputManager";
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
    keyManager.register("selectYUp", Keyboard.KEY_UP, false, "カーソルの高さを上げる");
    keyManager.register("selectYDown", Keyboard.KEY_DOWN, false, "カーソルの高さを下げる");
    keyManager.register("resetSelectY", Keyboard.KEY_F, false, "カーソルの高さをリセットする");
    keyManager.register("adjustSelectY", Keyboard.KEY_F, true, "カーソルの高さを合わせる");
    keyManager.register("resetSelected", Keyboard.KEY_C, false, "すべての選択とNGTOの状態をリセットする");
    //ーー地形操作ーー
    keyManager.register("widthUp", Keyboard.KEY_RIGHT, true, "地表の幅を拡大する");
    keyManager.register("widthDown", Keyboard.KEY_LEFT, true, "地表の幅を縮小する");
    keyManager.register("surfaceYUp", Keyboard.KEY_UP, true, "地表の高さを上げる");
    keyManager.register("surfaceYDown", Keyboard.KEY_DOWN, true, "地表の高さを下げる");
    keyManager.register("minYUp", Keyboard.KEY_O, true, "底の高さを上げる");
    keyManager.register("minYDown", Keyboard.KEY_L, true, "底の高さを下げる");

    //-------------------
    //--  ユーザー設定  --
    //-------------------

    posCollector = new PositionCollector();
    railMapCollector = new RailMapCollector();
    bezierCollector = new BezierCollector();
    quaternionManager = new HashMap();
    posListCache = new HashMap();
    initParts();
}
var keyManager: InputManager;
var Version: string;
var posCollector: PositionCollector;
var railMapCollector: RailMapCollector;
var quaternionManager: HashMap<Entity, Quaternion>;
var posListCache: HashMap<string, Pos[]>;
var bezierCollector: BezierCollector;

function keyInput(hostPlayer: EntityPlayer, entity: EntityVehicle, isRightClick: boolean, isLeftClick: boolean): void {
    const sender = hostPlayer as unknown as ICommandSender;
    const dataMap = entity.getResourceState().getDataMap();
    const lookingPos = NGTOBuilderUtilClient.getLookingPos();
    const world = entity.worldObj;
    const offsetY = dataMap.getInt("offsetY");
    const surfaceY = dataMap.getInt("surfaceY");
    const minY = dataMap.getInt("minY");
    let quaternion = quaternionManager.get(entity);
    if (!quaternion) {
        quaternion = new Quaternion();
        quaternionManager.put(entity, quaternion);
    }
    let diffusionRate = dataMap.getInt("diffusionRate");
    if (diffusionRate === 0) {
        diffusionRate = 20;
        dataMap.setInt("diffusionRate", diffusionRate, 1);
    }
    let fieldWidth = dataMap.getInt("fieldWidth");
    if (fieldWidth === 0) {
        fieldWidth = 10;
        dataMap.setInt("fieldWidth", fieldWidth, 1);
    }

    if (keyManager.pressed("showHelp")) {
        NGTLog.sendChatMessage(sender, `---NGTO Builder2 地形設置 操作方法---`);
        //ーー共通ーー
        NGTLog.sendChatMessage(sender, keyManager.getDescription("endEdit"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("build"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("cancelBuild"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("undo"));
        //ーーカーソル操作ーー
        NGTLog.sendChatMessage(sender, `---カーソル操作---`);
        NGTLog.sendChatMessage(sender, `[右クリック] 座標を選択/レールを選択`);
        NGTLog.sendChatMessage(sender, `[左クリック] 最後の選択を解除`);
        NGTLog.sendChatMessage(sender, keyManager.getDescription("selectYUp"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("selectYDown"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("resetSelected"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("resetSelectY"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("adjustSelectY"));
        //ーー機能ーー
        NGTLog.sendChatMessage(sender, `---機能---`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyManager.getOptionKeyCode())} + ホイールクリック] 補間モード切り替え`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyManager.getOptionKeyCode())} + マウスホイール上] 補間の拡散量を増やす`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyManager.getOptionKeyCode())} + マウスホイール下] 補間の拡散量を減らす`);
        //ーー地形操作ーー
        NGTLog.sendChatMessage(sender, `---地形操作---`);
        NGTLog.sendChatMessage(sender, keyManager.getDescription("widthUp"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("widthDown"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("surfaceYUp"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("surfaceYDown"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("minYUp"));
        NGTLog.sendChatMessage(sender, keyManager.getDescription("minYDown"));
    }

    //終了
    if (keyManager.down("endEdit")) {
        dataMap.setBoolean("isEndEdit", true, 1);
    }

    //生成
    const isBuilding = dataMap.getBoolean("isBuilding");
    const isUndo = dataMap.getBoolean("isUndo");
    const blockSet = NGTOBuilderUtil.getHeldBlockSet(hostPlayer);
    const hasTileEntity = RTMApiCompat.hasTileEntity(blockSet);
    const bezierList = bezierCollector.getAll(entity);
    if (keyManager.pressed("build") && bezierList.length > 0 && blockSet && !hasTileEntity && !isUndo && !isBuilding) {
        dataMap.setBoolean("isBuilding", true, 1);
        const ctrlPosList: BezierControlPoints[] = [];
        for (let bezierIdx = 0; bezierIdx < bezierList.length; bezierIdx++) {
            const bezier = bezierList[bezierIdx];
            if (!bezier) continue;
            ctrlPosList.push(bezier.getControlPoints());
        }
        //送信
        const sendData: ReceiveData_liner = {
            bezierList: ctrlPosList
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

    //座標を追加/レールを収集
    if (lookingPos && isRightClick) {
        const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.posX, lookingPos.posY + offsetY, lookingPos.posZ);
        if (railMapCollector.size(entity) > 0) {
            //レール選択中
            if (lookingRailMap && !railMapCollector.hasRailMap(entity, lookingRailMap)) {
                railMapCollector.add(entity, lookingRailMap, keyManager.downOptionKey());
                bezierCollector.addFromRailMap(entity, lookingRailMap, keyManager.downOptionKey());
            }
        }
        else if (posCollector.size(entity) > 0) {
            //座標選択中
            posCollector.add(entity, lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ);
            //ベジェ曲線を構築する
            const posList = posCollector.getAll(entity);
            bezierCollector.createFromPosList(entity, posList);
        }
        else {
            //初回選択
            if (lookingRailMap && !railMapCollector.hasRailMap(entity, lookingRailMap)) {
                railMapCollector.add(entity, lookingRailMap, keyManager.downOptionKey());
                bezierCollector.addFromRailMap(entity, lookingRailMap, keyManager.downOptionKey());
                //surfaceYが0なら-1にする
                if (surfaceY === 0) dataMap.setInt("surfaceY", -1, 1);
            }
            else posCollector.add(entity, lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ);
        }
    }

    //選択を解除
    if (isLeftClick) {
        if (railMapCollector.size(entity) > 0) {
            railMapCollector.pop(entity);
            bezierCollector.pop(entity);
            if (railMapCollector.size(entity) === 0) {
                //surfaceYが-1なら0にする
                if (surfaceY === -1) dataMap.setInt("surfaceY", 0, 1);
            }
        }
        else if (posCollector.size(entity) > 0) {
            posCollector.pop(entity);
            const posList = posCollector.getAll(entity);
            bezierCollector.createFromPosList(entity, posList);
        }
    }

    //カーソルの高さを上げる
    if (keyManager.pressed("selectYUp")) {
        dataMap.setInt("offsetY", offsetY + 1, 1);
    }

    //カーソルの高さを下げる
    if (keyManager.pressed("selectYDown")) {
        dataMap.setInt("offsetY", offsetY - 1, 1);
    }

    //カーソルの高さをリセットする
    if (keyManager.pressed("resetSelectY")) {
        dataMap.setInt("offsetY", 0, 1);
    }

    //カーソルの高さを合わせる
    if (keyManager.pressed("adjustSelectY")) {
        if (lookingPos && posCollector.size(entity) > 0) {
            const lastPos = posCollector.getLastPos(entity);
            if (lastPos) dataMap.setInt("offsetY", lastPos[1] - lookingPos.blockY, 1);
        }
    }

    //すべての選択とNGTOの状態をリセットする
    if (keyManager.pressed("resetSelected")) {
        railMapCollector.clear(entity);
        posCollector.clear(entity);
        bezierCollector.clear(entity);
        dataMap.setInt("surfaceY", 0, 1);
        dataMap.setInt("fieldWidth", 10, 1);
        dataMap.setInt("minY", -1, 1);
        dataMap.setInt("offsetY", 0, 1);
    }

    //補間モード切り替え
    const isMiddleClick = Mouse.isButtonDown(2);
    const prevMiddleClick = dataMap.getBoolean("prevMiddleClick");
    if (isMiddleClick !== prevMiddleClick) dataMap.setBoolean("prevMiddleClick", isMiddleClick, 0);
    if (keyManager.downOptionKey() && isMiddleClick && !prevMiddleClick) {
        const interpolationMode = dataMap.getInt("interpolationMode");
        const nextModeId = BlockDiffusionMode.next(interpolationMode);
        dataMap.setInt("interpolationMode", nextModeId, 1);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] 補間モード: ${BlockDiffusionMode.get(nextModeId).displayName}`);
    }

    //補間の拡散量を変更
    const mouseWheel = Mouse.getDWheel();
    if (keyManager.downOptionKey()) {
        if (mouseWheel > 0) {
            diffusionRate = diffusionRate + 5;
            dataMap.setInt("diffusionRate", diffusionRate, 1);
            NGTLog.sendChatMessage(sender, `[NGTO Builder2] 補間の拡散量: ${diffusionRate / 100}[m]`);
        }
        else if (mouseWheel < 0) {
            diffusionRate = diffusionRate - 5;
            dataMap.setInt("diffusionRate", diffusionRate, 1);
            NGTLog.sendChatMessage(sender, `[NGTO Builder2] 補間の拡散量: ${diffusionRate / 100}[m]`);
        }
    }

    //地表の幅を拡大する
    if (keyManager.pressed("widthUp") || keyManager.held("widthUp", 300)) {
        dataMap.setInt("fieldWidth", fieldWidth + 1, 1);
    }

    //地表の幅を縮小する
    if (keyManager.pressed("widthDown") || keyManager.held("widthDown", 300)) {
        dataMap.setInt("fieldWidth", fieldWidth - 1, 1);
    }

    //地表の高さを上げる
    if (keyManager.pressed("surfaceYUp")) {
        dataMap.setInt("surfaceY", surfaceY + 1, 1);
    }

    //地表の高さを下げる
    if (keyManager.pressed("surfaceYDown")) {
        dataMap.setInt("surfaceY", surfaceY - 1, 1);
    }

    //底の高さを上げる
    if (keyManager.pressed("minYUp")) {
        dataMap.setInt("minY", minY + 1, 1);
    }

    //底の高さを下げる
    if (keyManager.pressed("minYDown")) {
        dataMap.setInt("minY", minY - 1, 1);
    }
}

//#################
//##  パーツ登録  ##
//#################
//## グローバル変数として使うための準備 ##
var body: Parts;
var point: Parts;
var selected: Parts;
var placeBlockFrame: Parts;
var selectedLine: Parts;
var lookingLine: Parts;
var selectedLineArrow: Parts;
var lookingLineArrow: Parts;
var selectedLineArrowF: Parts;
var lookingLineArrowF: Parts;

function initParts(): void {
    //## 描画パーツの設定 ##
    body = renderer.registerParts(new Parts("body"));
    point = renderer.registerParts(new Parts("point"));
    selected = renderer.registerParts(new Parts("selected"));
    placeBlockFrame = renderer.registerParts(new Parts("placeBlockFrame"));
    selectedLine = renderer.registerParts(new Parts("selectedLine"));
    lookingLine = renderer.registerParts(new Parts("lookingLine"));
    selectedLineArrow = renderer.registerParts(new Parts("selectedLineArrow"));
    lookingLineArrow = renderer.registerParts(new Parts("lookingLineArrow"));
    selectedLineArrowF = renderer.registerParts(new Parts("selectedLineArrowF"));
    lookingLineArrowF = renderer.registerParts(new Parts("lookingLineArrowF"));
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
    const offsetY = dataMap.getInt("offsetY");
    const isBuilding = dataMap.getBoolean("isBuilding");
    const isUndo = dataMap.getBoolean("isUndo");
    const world = entity.worldObj;

    //カーソル
    if (lookingPos) {
        if (railMapCollector.size(entity) > 0) {
            //## ハイライト描画
        }
        else if (posCollector.size(entity) > 0) {
            //ブロック選択中
            GL11.glPushMatrix();
            GL11.glTranslatef(lookingPos.blockX + 0.5, lookingPos.blockY + 0.5 + offsetY, lookingPos.blockZ + 0.5);
            GL11.glTranslatef(-posX, -posY, -posZ);
            point.render(renderer);
            GL11.glPopMatrix();
        }
        else {
            //初回選択
            const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.posX, lookingPos.posY + offsetY, lookingPos.posZ);
            if (lookingRailMap) {
                //## ハイライト描画
            }
            else {
                GL11.glPushMatrix();
                GL11.glTranslatef(lookingPos.blockX + 0.5, lookingPos.blockY + 0.5 + offsetY, lookingPos.blockZ + 0.5);
                GL11.glTranslatef(-posX, -posY, -posZ);
                point.render(renderer);
                GL11.glPopMatrix();
            }
        }
    }

    //ブロック選択でベジェ曲線を表示
    if (bezierCollector.size(entity) > 0) {
        const bezierList = bezierCollector.getAll(entity);
        const cullEnabled = GL11.glIsEnabled(GL11.GL_CULL_FACE);
        bezierList.forEach(bezier => {
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            GL11.glDisable(GL11.GL_DEPTH_TEST);
            GL11.glEnable(GL11.GL_CULL_FACE);
            NGTOBuilderUtilClient.renderBezierStatic(renderer, selectedLine, bezier);
            NGTOBuilderUtilClient.renderBezierStatic(renderer, selectedLineArrow, bezier, 10);
            GL11.glEnable(GL11.GL_DEPTH_TEST);
            if (!cullEnabled) GL11.glDisable(GL11.GL_CULL_FACE);
            NGTOBuilderUtilClient.renderBezierStatic(renderer, selectedLine, bezier);
            NGTOBuilderUtilClient.renderBezierStatic(renderer, selectedLineArrow, bezier, 10);
            GL11.glPopMatrix();
        });
    }

    //選択済みの描画
    if (railMapCollector.size(entity) === 0 && posCollector.size(entity) > 0) {
        //ブロック選択中
        const posList = posCollector.getAll(entity);
        GL11.glPushMatrix();
        GL11.glTranslatef(-posX + 0.5, -posY + 0.5, -posZ + 0.5);
        NGTOBuilderUtilClient.renderPosListStatic(renderer, selected, entity, posList);
        GL11.glPopMatrix();
    }

    //ブロックフレーム表示
    const surfaceY = dataMap.getInt("surfaceY") + 1;
    const fieldWidth = dataMap.getInt("fieldWidth");
    const depth = dataMap.getInt("minY");
    const interpolationMode = dataMap.getInt("interpolationMode");
    const diffusionRate = dataMap.getInt("diffusionRate");
    if (bezierCollector.size(entity) > 0) {
        const hash = String(entity.getEntityId()) + "|" + String(interpolationMode) + "|" + String(diffusionRate) + "|" + bezierCollector.getCacheKey(entity) + "|"
            + String(surfaceY) + "|" + String(fieldWidth) + "|" + String(depth);
        let posList: Pos[] = posListCache.get(hash);
        if (!posList || posList.length === 0) {
            //ベジェ曲線ごとにRBOを作って合成する
            const margedRBO = new RotatableBlockObject();
            const bezierList = bezierCollector.getAll(entity);
            const origin = bezierList[0].getPoint(1, 0);
            //minYを走査して決定する
            let minY = origin[1];
            for (let bezierIdx = 0; bezierIdx < bezierList.length; bezierIdx++) {
                const bezier = bezierList[bezierIdx];
                const split = Math.max(1, Math.floor(bezier.getLength() * 2));
                for (let idx = 0; idx <= split; idx++) {
                    const pos = bezier.getPoint(split, idx);
                    const maxY = pos[1] + surfaceY;
                    minY = Math.min(minY, pos[1] + depth, maxY);
                }
            }
            //ベジェ曲線展開
            const boxWidth = fieldWidth * 2 + 1;
            const isHuge = boxWidth > 40;
            for (let bezierIdx = 0; bezierIdx < bezierList.length; bezierIdx++) {
                const bezier = bezierList[bezierIdx];
                const split = Math.max(1, Math.floor(bezier.getLength() * 2));
                for (let idx = 0; idx <= split; idx++) {
                    const isEdge = idx === 0 || idx === split;
                    const pos = bezier.getPoint(split, idx);
                    const maxY = pos[1] + surfaceY;
                    const diffY = pos[1] - minY;
                    const yaw = bezier.getYaw(split, idx);
                    const boxHeight = Math.max(Math.abs(maxY - minY), 1);
                    //const rbo = RotatableBlockObjectFactory.createBox(new BlockSet(Blocks.stone, 0), boxWidth, boxHeight, 1);
                    const rbo = new RotatableBlockObject();
                    const topRBO = isHuge ?
                        RotatableBlockObjectFactory.createSideWalls(new BlockSet(Blocks.stone, 0), boxWidth, 1) :
                        RotatableBlockObjectFactory.createBox(new BlockSet(Blocks.stone, 0), boxWidth, 1, 1);
                    topRBO.offset(0, boxHeight - 1, 0);
                    const bottomRBO = RotatableBlockObjectFactory.createSideWalls(new BlockSet(Blocks.stone, 0), boxWidth, (isEdge ? boxHeight : 1));
                    rbo.merge(topRBO).merge(bottomRBO);
                    const centerX = Math.floor(boxWidth / 2) + 0.5;
                    rbo.setPivot(centerX, 0.5, 0.5);
                    rbo.rotate(-yaw, 0, 0);
                    rbo.movePivotToBase();
                    rbo.offset(
                        Math.floor(pos[0]) - Math.floor(origin[0]),
                        Math.floor(pos[1]) - Math.floor(origin[1]) - diffY,//起点が壁の底
                        Math.floor(pos[2]) - Math.floor(origin[2])
                    );
                    margedRBO.merge(rbo);
                }
            }
            RotatableBlockObjectMapper.applyDiffusionSelf(margedRBO, BlockDiffusionMode.get(interpolationMode).withRate(diffusionRate / 100));
            RotatableBlockObjectMapper.toBlockCoordSelf(margedRBO);
            posList = RotatableBlockObjectMapper.getPosList(margedRBO, origin[0], origin[1], origin[2]);
            posListCache.put(hash, posList);
        }
        //描画
        GL11.glPushMatrix();
        GL11.glTranslatef(-posX + 0.5, -posY + 0.5, -posZ + 0.5);
        NGTOBuilderUtilClient.renderPosListStatic(renderer, placeBlockFrame, entity, posList, true);
        GL11.glPopMatrix();
    }

    //ハイライト描画 テクスチャが壊れるためこれ以降では通常描画しない
    if (railMapCollector.size(entity) > 0) {
        //レール選択中
        const collectList = railMapCollector.getAll(entity);
        const railMapList = collectList[0];
        const dirList = collectList[1];
        GL11.glPushMatrix();
        GL11.glTranslatef(-posX, -posY, -posZ);
        for (let rmIdx = 0; rmIdx < railMapList.length; rmIdx++) {
            const rm = railMapList[rmIdx];
            const isReverse = dirList[rmIdx];
            NGTOBuilderUtilClient.renderRailMapHighlight(entity, rm, "#20d3ff", 0.3);
            if (isReverse) NGTOBuilderUtilClient.renderRailMapStatic(renderer, selectedLineArrowF, rm, 10);
            else NGTOBuilderUtilClient.renderRailMapStatic(renderer, selectedLineArrow, rm, 10);
        }
        GL11.glPopMatrix();
    }

    //カーソル
    if (lookingPos) {
        if (railMapCollector.size(entity) > 0) {
            //レール選択中
            const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.posX, lookingPos.posY + offsetY, lookingPos.posZ);
            if (lookingRailMap && !railMapCollector.hasRailMap(entity, lookingRailMap)) {
                GL11.glPushMatrix();
                GL11.glTranslatef(-posX, -posY, -posZ);
                NGTOBuilderUtilClient.renderRailMapHighlight(entity, lookingRailMap, "#ff7f00", 0.3);
                if (keyManager.downOptionKey()) NGTOBuilderUtilClient.renderRailMapStatic(renderer, lookingLineArrowF, lookingRailMap, 10);
                else NGTOBuilderUtilClient.renderRailMapStatic(renderer, lookingLineArrow, lookingRailMap, 10);
                GL11.glPopMatrix();
            }
        }
        else if (posCollector.size(entity) > 0) {
            //## 通常描画
        }
        else {
            //初回選択
            const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.posX, lookingPos.posY + offsetY, lookingPos.posZ);
            if (lookingRailMap) {
                GL11.glPushMatrix();
                GL11.glTranslatef(-posX, -posY, -posZ);
                NGTOBuilderUtilClient.renderRailMapHighlight(entity, lookingRailMap, "#ff7f00", 0.3);
                if (keyManager.downOptionKey()) NGTOBuilderUtilClient.renderRailMapStatic(renderer, lookingLineArrowF, lookingRailMap, 10);
                else NGTOBuilderUtilClient.renderRailMapStatic(renderer, lookingLineArrow, lookingRailMap, 10);
                GL11.glPopMatrix();
            }
            else {
                //## 通常描画
            }
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
function renderWithAlpha(part: Parts, alpha: number): void {
    NGTOBuilderUtilClient.enableAlpha(alpha);
    part.render(renderer);
    NGTOBuilderUtilClient.disableAlpha();
}

function renderWithScale(part: Parts, scaleX: number, scaleY: number, scaleZ: number): void {
    GL11.glPushMatrix();
    GL11.glScalef(scaleX, scaleY, scaleZ);
    part.render(renderer);
    GL11.glPopMatrix();
}