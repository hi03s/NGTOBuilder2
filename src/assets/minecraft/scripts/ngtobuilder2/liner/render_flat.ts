import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapper, MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { RTMCore } from "jp.ngt.rtm";
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
declare const renderer: VehiclePartsRenderer;

//##  NGTO Builder2 Prop設置  ##

//initに設定するグローバル関数の宣言
function init(par1: ModelSetVehicle, par2: ModelObject): void {
    //バージョン
    Version = "1.0";
    // v1.0 初回リリース

    //###################
    //##  ユーザー設定  ##
    //###################

    //キー設定 
    keyMap = {
        //オプションキー
        option: Keyboard.KEY_LCONTROL,

        //終了
        endEdit: Keyboard.KEY_Q,

        //生成
        build: Keyboard.KEY_RETURN,

        //生成を中止
        cancelBuild: Keyboard.KEY_BACK,

        //Undo
        undo: Keyboard.KEY_Z,

        //ヘルプをチャットに表示
        showHelp: Keyboard.KEY_H,

        //選択をすべて解除
        resetSelected: Keyboard.KEY_C,

        //高さ変更
        selectYUp: Keyboard.KEY_UP,
        selectYDown: Keyboard.KEY_DOWN,

        //Y座標オフセットをリセット / Y座標オフセットをスナップ[+optionキー]
        resetSelectY: Keyboard.KEY_F,

        //幅を変える[+optionキー]
        widthUp: Keyboard.KEY_RIGHT,
        widthDown: Keyboard.KEY_LEFT,

        //表面の高さを変える[+optionキー]
        surfaceYUp: Keyboard.KEY_UP,
        surfaceYDown: Keyboard.KEY_DOWN,

        //深さを変える
        minYUp: Keyboard.KEY_O,
        minYDown: Keyboard.KEY_L,

        //補間モード切り替え
        switchInterpolationMode: Keyboard.KEY_U,

        //補間の拡散量を変更 [+optionキー]
        diffusionRateUp: Keyboard.KEY_O,
        diffusionRateDown: Keyboard.KEY_P
    }

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

var keyMap: {
    option: number;
    endEdit: number;
    build: number;
    undo: number;
    showHelp: number;
    cancelBuild: number;
    resetSelected: number;
    selectYUp: number;
    selectYDown: number;
    widthUp: number;
    widthDown: number;
    switchInterpolationMode: number;
    diffusionRateUp: number;
    diffusionRateDown: number;
    minYUp: number;
    minYDown: number;
    surfaceYUp: number;
    surfaceYDown: number;
    resetSelectY: number;
};
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
    const isKeyDownOption = Keyboard.isKeyDown(keyMap.option);
    const surfaceY = dataMap.getInt("surfaceY");
    let quaternion = quaternionManager.get(entity);
    if (!quaternion) {
        quaternion = new Quaternion();
        quaternionManager.put(entity, quaternion);
    }

    //ツールを終了
    if (Keyboard.isKeyDown(keyMap.endEdit)) {
        dataMap.setBoolean("isEndEdit", true, 1);
    }

    //ヘルプ表示
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "showHelp", keyMap.showHelp)) {
        NGTLog.sendChatMessage(sender, `---NGTO Builder2 Liner設置 操作方法---`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.endEdit)}] ツールを終了`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.build)}] 手に持っているNGTOを生成する`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.undo)}] Undo`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.cancelBuild)}] 生成を中止する`);
        NGTLog.sendChatMessage(sender, `[右クリック] 座標を選択/レールを選択`);
        NGTLog.sendChatMessage(sender, `[左クリック] 最後の選択を解除`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.resetSelected)}] すべての選択と形状をリセットする`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.selectYUp)}] 選択のY高さを上げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.selectYDown)}] 選択のY高さを下げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.switchInterpolationMode)}] ブロック補間モードを切り替え`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.diffusionRateUp)}] 補間の拡散量を増やす`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.diffusionRateDown)}] 補間の拡散量を減らす`);
        NGTLog.sendChatMessage(sender, `---地面を操作---`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.surfaceYUp)}] 表面の高さを上げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.surfaceYDown)}] 表面の高さを下げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.widthUp)}] 幅を増やす`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.widthDown)}] 幅を減らす`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.minYUp)}] 最低Y高さを上げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.minYDown)}] 最低Y高さを下げる`);
    }

    //座標を追加/レールを収集
    if (lookingPos && isRightClick) {
        const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.posX, lookingPos.posY + offsetY, lookingPos.posZ);
        if (railMapCollector.size(entity) > 0) {
            //レール選択中
            if (lookingRailMap && !railMapCollector.hasRailMap(entity, lookingRailMap)) {
                railMapCollector.add(entity, lookingRailMap, Keyboard.isKeyDown(keyMap.option));
                bezierCollector.addFromRailMap(entity, lookingRailMap, Keyboard.isKeyDown(keyMap.option));
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
                railMapCollector.add(entity, lookingRailMap, Keyboard.isKeyDown(keyMap.option));
                bezierCollector.addFromRailMap(entity, lookingRailMap, Keyboard.isKeyDown(keyMap.option));
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

    //すべての選択とNGTOの鏡像/回転状態をリセットする
    if (!isKeyDownOption && NGTOBuilderUtilClient.isKeyDown(dataMap, "resetSelected", keyMap.resetSelected)) {
        railMapCollector.clear(entity);
        posCollector.clear(entity);
        bezierCollector.clear(entity);
        dataMap.setInt("surfaceY", 0, 1);
        dataMap.setInt("fieldWidth", 10, 1);
        dataMap.setInt("minY", -1, 1);
        dataMap.setInt("offsetY", 0, 1);
    }

    //選択Y座標
    if (!isKeyDownOption && NGTOBuilderUtilClient.isKeyDown(dataMap, "selectYUp", keyMap.selectYUp)) {
        dataMap.setInt("offsetY", offsetY + 1, 1);
    }
    if (!isKeyDownOption && NGTOBuilderUtilClient.isKeyDown(dataMap, "selectYDown", keyMap.selectYDown)) {
        dataMap.setInt("offsetY", offsetY - 1, 1);
    }
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "resetSelectY", keyMap.resetSelectY)) {
        if (isKeyDownOption) {
            if (lookingPos && posCollector.size(entity) > 0) {
                const lastPos = posCollector.getLastPos(entity);
                if (lastPos) dataMap.setInt("offsetY", lastPos[1] - lookingPos.blockY, 1);
            }
        }
        else {
            dataMap.setInt("offsetY", 0, 1);
        }
    }

    //補間モードを切り替え
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "switchInterpolationMode", keyMap.switchInterpolationMode)) {
        const interpolationMode = dataMap.getInt("interpolationMode");
        const nextModeId = BlockDiffusionMode.next(interpolationMode);
        dataMap.setInt("interpolationMode", nextModeId, 1);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] 補間モード: ${BlockDiffusionMode.get(nextModeId).displayName}`);
    }

    //補間の拡散量を変更
    let diffusionRate = dataMap.getInt("diffusionRate");
    if (diffusionRate === 0) {
        diffusionRate = 20;
        dataMap.setInt("diffusionRate", diffusionRate, 1);
    }
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "diffusionRateUp", keyMap.diffusionRateUp) && isKeyDownOption && diffusionRate < 100) {
        diffusionRate = diffusionRate + 5;
        dataMap.setInt("diffusionRate", diffusionRate, 1);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] 補間の拡散量: ${diffusionRate / 100}[m]`);
    }
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "diffusionRateDown", keyMap.diffusionRateDown) && isKeyDownOption && diffusionRate > 5) {
        diffusionRate = diffusionRate - 5;
        dataMap.setInt("diffusionRate", diffusionRate, 1);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] 補間の拡散量: ${diffusionRate / 100}[m]`);
    }

    //表面の高さを操作
    if (isKeyDownOption && NGTOBuilderUtilClient.isKeyDown(dataMap, "surfaceYUp", keyMap.surfaceYUp)) {
        dataMap.setInt("surfaceY", surfaceY + 1, 1);
    }
    if (isKeyDownOption && NGTOBuilderUtilClient.isKeyDown(dataMap, "surfaceYDown", keyMap.surfaceYDown)) {
        dataMap.setInt("surfaceY", surfaceY - 1, 1);
    }

    //幅を操作
    const fieldWidth = dataMap.getInt("fieldWidth");
    if (fieldWidth === 0) {
        dataMap.setInt("fieldWidth", 10, 1);
    }
    if (isKeyDownOption && (
        NGTOBuilderUtilClient.isKeyDown(dataMap, "widthUp", keyMap.widthUp) ||
        NGTOBuilderUtilClient.isKeyDownLong(dataMap, "widthUp", keyMap.widthUp, 300))
    ) {
        dataMap.setInt("fieldWidth", fieldWidth + 1, 1);
    }
    if (isKeyDownOption && fieldWidth > 1 &&
        NGTOBuilderUtilClient.isKeyDown(dataMap, "widthDown", keyMap.widthDown) ||
        NGTOBuilderUtilClient.isKeyDownLong(dataMap, "widthDown", keyMap.widthDown, 300)
    ) {
        dataMap.setInt("fieldWidth", fieldWidth - 1, 1);
    }

    //最低Y高さを操作
    const minY = dataMap.getInt("minY");
    if (minY === 0) {
        dataMap.setInt("minY", -1, 1);
    }
    if (!isKeyDownOption && NGTOBuilderUtilClient.isKeyDown(dataMap, "minYUp", keyMap.minYUp) && minY < -1) {
        dataMap.setInt("minY", minY + 1, 1);
    }
    if (!isKeyDownOption && NGTOBuilderUtilClient.isKeyDown(dataMap, "minYDown", keyMap.minYDown)) {
        dataMap.setInt("minY", minY - 1, 1);
    }

    //生成
    const isBuilding = dataMap.getBoolean("isBuilding");
    const isUndo = dataMap.getBoolean("isUndo");
    const blockSet = NGTOBuilderUtil.getHeldBlockSet(hostPlayer);
    const hasTileEntity = RTMApiCompat.hasTileEntity(blockSet);
    const bezierList = bezierCollector.getAll(entity);
    if (!isKeyDownOption && bezierList.length > 0 && blockSet && !hasTileEntity && !isUndo && !isBuilding && NGTOBuilderUtilClient.isKeyDown(dataMap, "build", keyMap.build)) {
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
    if (isKeyDownOption && isBuilding && NGTOBuilderUtilClient.isKeyDown(dataMap, "cancelBuild", keyMap.cancelBuild)) {
        NGTLog.sendChatMessage(sender, "[NGTO Builder2] 生成を中止");
        dataMap.setBoolean("cancelBuild", true, 1);
    }

    //Undo
    const canUndo = dataMap.getBoolean("canUndo");
    if (isKeyDownOption && canUndo && !isBuilding && !isUndo && NGTOBuilderUtilClient.isKeyDown(dataMap, "undo", keyMap.undo)) {
        dataMap.setBoolean("isUndo", true, 1);
        NGTLog.sendChatMessage(sender, "[NGTO Builder2] Undo...");
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
                        RotatableBlockObjectFactory.createSideWall(new BlockSet(Blocks.stone, 0), boxWidth, 1) :
                        RotatableBlockObjectFactory.createBox(new BlockSet(Blocks.stone, 0), boxWidth, 1, 1);
                    topRBO.offset(0, boxHeight - 1, 0);
                    const bottomRBO = RotatableBlockObjectFactory.createSideWall(new BlockSet(Blocks.stone, 0), boxWidth, (isEdge ? boxHeight : 1));
                    rbo.marge(topRBO).marge(bottomRBO);
                    const centerX = Math.floor(boxWidth / 2) + 0.5;
                    rbo.setPivot(centerX, 0.5, 0.5);
                    rbo.rotate(-yaw, 0, 0);
                    rbo.movePivotToBase();
                    rbo.offset(
                        Math.floor(pos[0]) - Math.floor(origin[0]),
                        Math.floor(pos[1]) - Math.floor(origin[1]) - diffY,//起点が壁の底
                        Math.floor(pos[2]) - Math.floor(origin[2])
                    );
                    margedRBO.marge(rbo);
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
                if (Keyboard.isKeyDown(keyMap.option)) NGTOBuilderUtilClient.renderRailMapStatic(renderer, lookingLineArrowF, lookingRailMap, 10);
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
                if (Keyboard.isKeyDown(keyMap.option)) NGTOBuilderUtilClient.renderRailMapStatic(renderer, lookingLineArrowF, lookingRailMap, 10);
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
    if (isLeftClick !== prevIsLeftClick) dataMap.setBoolean("prevIsLeftClick", isLeftClick, 0);
    if (isRightClick !== prevIsRightClick) dataMap.setBoolean("prevIsRightClick", isRightClick, 0);
    const VERSIONS_server = dataMap.getString("VERSIONS");
    const isVersionChecked = dataMap.getBoolean("isVersionChecked");
    RTMApiCompat.doFollowing(entity, hostPlayer);//1.12用
    if (hostPlayer && hostPlayer === player) {
        if ((VERSIONS_server != Version) && !isVersionChecked) {
            dataMap.setBoolean("isVersionChecked", true, 0);
            NGTLog.sendChatMessage(sender, "§cVersions don't match!");
            NGTLog.sendChatMessage(sender, "§cClient:" + Version);
            NGTLog.sendChatMessage(sender, "§cServer:" + VERSIONS_server);
        }
        const showHelpMessage = dataMap.getBoolean("showHelpMessage");
        if (!showHelpMessage) {
            dataMap.setBoolean("showHelpMessage", true, 0);
            NGTLog.sendChatMessage(sender, `Show help : ${Keyboard.getKeyName(keyMap.showHelp)} key`);
        }
        if (!isOpenGUI && pass === 0 && renderer.currentMatId === 0) keyInput(hostPlayer, entity, (!prevIsRightClick && isRightClick), (!prevIsLeftClick && isLeftClick));
        renderForToolUser(entity, pass, par3);
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