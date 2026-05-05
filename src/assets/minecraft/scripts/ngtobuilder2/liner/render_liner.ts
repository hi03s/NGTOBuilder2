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
import { NGTObject } from "jp.ngt.ngtlib.block";
import { TileEntityLargeRailBase } from "jp.ngt.rtm.rail";
import { RailMapCollector } from "../../lib_hi03toolkit_1_0/lib_RailMapCollector";
import { BezierCollector } from "../../lib_hi03toolkit_1_0/lib_BezierCollector";
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
        offsetYUp: Keyboard.KEY_UP,
        offsetYDown: Keyboard.KEY_DOWN,

        //Y座標オフセットをリセット/Y座標オフセットをスナップ(+オプション)
        resetOffsetY: Keyboard.KEY_F
    }

    //-------------------
    //--  ユーザー設定  --
    //-------------------

    posCollector = new PositionCollector();
    railMapCollector = new RailMapCollector();
    bezierCollector = new BezierCollector();
    quaternionManager = new HashMap();
    posListCache = new HashMap();
    prevNGTOData = new HashMap();
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
    offsetYUp: number;
    offsetYDown: number;
    resetOffsetY: number;
};
var Version: string;
var posCollector: PositionCollector;
var railMapCollector: RailMapCollector;
var quaternionManager: HashMap<Entity, Quaternion>;
var posListCache: HashMap<string, Pos[]>;
var prevNGTOData: HashMap<Entity, NGTObject | null>;
var bezierCollector: BezierCollector;

function keyInput(hostPlayer: EntityPlayer, entity: EntityVehicle, isRightClick: boolean, isLeftClick: boolean): void {
    const sender = hostPlayer as unknown as ICommandSender;
    const dataMap = entity.getResourceState().getDataMap();
    const lookingPos = NGTOBuilderUtilClient.getLookingPos();
    const world = entity.worldObj;
    const offsetY = dataMap.getInt("offsetY");
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
        NGTLog.sendChatMessage(sender, `---NGTO Builder2 Prop設置 操作方法---`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.endEdit)}] ツールを終了`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.build)}] NGTOを生成する`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.undo)}] Undo`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.cancelBuild)}] 生成を中止する`);
        NGTLog.sendChatMessage(sender, `[右クリック] 座標を選択/レールを選択`);
        NGTLog.sendChatMessage(sender, `[左クリック] 最後の選択を解除`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.offsetYUp)}] 選択のY高さを上げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.offsetYDown)}] 選択のY高さを下げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.resetOffsetY)}] 選択のY高さをリセットする`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.resetOffsetY)}] 選択のY高さを最後の選択に合わせる`);
    }

    //座標を追加/レールを収集
    if (lookingPos && isRightClick) {
        const tile = RTMApiCompat.getTileEntity(world, lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ);
        if (railMapCollector.size(entity) > 0) {
            //レール選択中
            if (tile instanceof TileEntityLargeRailBase) railMapCollector.addAt(entity, lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ, Keyboard.isKeyDown(keyMap.option));
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
            if (tile instanceof TileEntityLargeRailBase) railMapCollector.addAt(entity, lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ, Keyboard.isKeyDown(keyMap.option));
            else posCollector.add(entity, lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ);
        }
    }

    //選択を解除
    if (isLeftClick) {
        railMapCollector.pop(entity);
        posCollector.pop(entity);
        //ベジェ曲線を構築する
        const posList = posCollector.getAll(entity);
        bezierCollector.createFromPosList(entity, posList);
    }

    //選択をすべて解除
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "resetSelected", keyMap.resetSelected)) {
        railMapCollector.clear(entity);
        posCollector.clear(entity);
        bezierCollector.clear(entity);
    }

    //オフセットY
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "offsetYUp", keyMap.offsetYUp)) {
        dataMap.setInt("offsetY", offsetY + 1, 1);
    }
    else if (NGTOBuilderUtilClient.isKeyDown(dataMap, "offsetYDown", keyMap.offsetYDown)) {
        dataMap.setInt("offsetY", offsetY - 1, 1);
    }
    else if (NGTOBuilderUtilClient.isKeyDown(dataMap, "resetOffsetY", keyMap.resetOffsetY)) {
        if (Keyboard.isKeyDown(keyMap.option)) {
            if (lookingPos && posCollector.size(entity) > 0) {
                const lastPos = posCollector.getLastPos(entity);
                if (lastPos) dataMap.setInt("offsetY", lastPos[1] - lookingPos.blockY, 1);
            }
        }
        else {
            dataMap.setInt("offsetY", 0, 1);
        }
    }
}

//#################
//##  パーツ登録  ##
//#################
declare global {
    //## グローバル変数として使うための準備 ##
    var body: Parts;
    var point: Parts;
    var selected: Parts;
    var placeBlockFrame: Parts;
    var selectedLine: Parts;
    var lookingLine: Parts;

}
function initParts(): void {
    //## 描画パーツの設定 ##
    body = renderer.registerParts(new Parts("body"));
    point = renderer.registerParts(new Parts("point"));
    selected = renderer.registerParts(new Parts("selected"));
    placeBlockFrame = renderer.registerParts(new Parts("placeBlockFrame"));
    selectedLine = renderer.registerParts(new Parts("selectedLine"));
    lookingLine = renderer.registerParts(new Parts("lookingLine"));
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
            //レール選択中
            const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ);
            if (lookingRailMap) {
                GL11.glPushMatrix();
                GL11.glTranslatef(-posX, -posY, -posZ);
                NGTOBuilderUtilClient.renderRailMapStatic(renderer, lookingLine, lookingRailMap);
                GL11.glPopMatrix();
            }
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
            const lookingRailMap = NGTOBuilderUtil.getRailMapAt(entity, lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ);
            if (lookingRailMap) {
                GL11.glPushMatrix();
                GL11.glTranslatef(-posX, -posY, -posZ);
                NGTOBuilderUtilClient.renderRailMapStatic(renderer, lookingLine, lookingRailMap);
                GL11.glPopMatrix();
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

    //選択済みの描画
    if (railMapCollector.size(entity) > 0) {
        //レール選択中
        const railMapList = railMapCollector.getAllRailMap(entity);
        GL11.glPushMatrix();
        GL11.glTranslatef(-posX, -posY, -posZ);
        railMapList.forEach(rm => { NGTOBuilderUtilClient.renderRailMapStatic(renderer, selectedLine, rm); });
        GL11.glPopMatrix();
    }
    else if (posCollector.size(entity) > 0) {
        //ブロック選択中
        const posList = posCollector.getAll(entity);
        GL11.glPushMatrix();
        GL11.glTranslatef(-posX + 0.5, -posY + 0.5, -posZ + 0.5);
        NGTOBuilderUtilClient.renderPosListStatic(renderer, selected, entity, posList);
        GL11.glPopMatrix();
    }

    //ブロック選択でベジェ曲線を表示
    if (bezierCollector.size(entity) > 0) {
        const bezierList = bezierCollector.getAll(entity);
        bezierList.forEach(bezier => {
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX + 0.5, -posY + 0.5, -posZ + 0.5);
            NGTOBuilderUtilClient.renderBezierStatic(renderer, selectedLine, bezier);
            GL11.glPopMatrix();
        });
    }
}

//本体の描画(モデル選択と画面併用)
function renderInMenu(): void {
    body.render(renderer);
}

//#################################
//#################################
declare global {
    var isKaizPatch: boolean;
}
isKaizPatch = RTMCore.VERSION.indexOf("KaizPatch") !== -1;
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