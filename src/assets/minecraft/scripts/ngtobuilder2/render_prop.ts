import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapper, MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { RTMCore } from "jp.ngt.rtm";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ModelSetVehicle } from "jp.ngt.rtm.modelpack.modelset";
import { ModelObject, Parts, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { ICommandSender } from "net.minecraft.command";
import { EntityPlayer } from "net.minecraft.entity.player";
import { Keyboard, Mouse } from "org.lwjgl.input";
import { NGTOBuilderUtilClient } from "./lib_hi03toolkit_1_0/lib_NGTOBuilderUtilClient";
import { PositionCollector } from "./lib_hi03toolkit_1_0/lib_PositionCollector";
import { combineNGTOList, NGTOBuilderUtil } from "./lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { RTMApiCompat } from "./lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { GL11 } from "org.lwjgl.opengl";
import { BlockSet } from "jp.ngt.ngtlib.block";
import { Blocks } from "net.minecraft.init";
declare const renderer: VehiclePartsRenderer;

//#################################
//##  hi03式エディターツール v1.0  ##
//#################################
/*
NGTO BuilderやSuperRailBuilder3のような自動車モデル型のエディターツールの雛形です
キー入力はクライアント側で行い、ブロック変更などのワールド処理はサーバー側が担当します
不要なコメントアウトはすべて消してください
テスト用の機能が記述されているので、不要な部分は消してください
*/

//####################
//##  ユーザー設定  ###
//####################
//initに設定するグローバル関数の宣言
declare global {
    //キー設定
    var keyMap: {
        option: number;
        endEdit: number;
        build: number;
        clear: number;
        isIgnoreAir: number;
        undo: number;
    };
    //バージョンチェック
    var Version: string;
    //座標コレクター
    var collector: PositionCollector;
}
function init(par1: ModelSetVehicle, par2: ModelObject): void {
    //キー設定 
    keyMap = {
        //オプションキー(このキーを押しながらだと他のキーの機能が有効になる)
        option: Keyboard.KEY_LCONTROL,

        //終了
        endEdit: Keyboard.KEY_Q,

        //生成
        build: Keyboard.KEY_RETURN,

        //選択をすべて削除
        clear: Keyboard.KEY_C,

        //生成するときに空気ブロックを無視するかどうか
        isIgnoreAir: Keyboard.KEY_P,

        //Undo
        undo: Keyboard.KEY_Z
    }

    //バージョンチェック
    //サーバー側とバージョンチェックを行います ※一致していなくても利用自体はできます
    Version = "1.0";

    //座標コレクター
    collector = new PositionCollector();

    //####################
    initParts();
}

//###############
//##  キー入力  ##
//###############
//使用中のプレイヤーのみ有効です GUIが開いているときは入力が無効になります
//isRightClick, isLeftClickはクリックしたした瞬間だけtrueになります
//連続入力を検知する場合は 左クリック:Mouse.isButtonDown(0), 右クリック:Mouse.isButtonDown(1) を使用してください
function keyInput(hostPlayer : EntityPlayer, entity: EntityVehicle, isRightClick: boolean, isLeftClick: boolean): void {
    const sender = hostPlayer as unknown as ICommandSender;
    const dataMap = entity.getResourceState().getDataMap();

    //NGTOのキャッシュを更新する必要があるかどうかのフラグ
    //データの生成処理が重いため、必要なときにだけ更新するようにする
    let updateNGTOCache = false;

    //エディタの使用を終了する
    if (Keyboard.isKeyDown(keyMap.endEdit)) {
        dataMap.setBoolean("isEndEdit", true, 1);
    }

    //生成するときに空気ブロックを無視するかどうかの切り替え
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.isIgnoreAir)) {
        const isIgnoreAir = dataMap.getBoolean("isIgnoreAir");
        dataMap.setBoolean("isIgnoreAir", !isIgnoreAir, 1);
        NGTLog.sendChatMessage(sender, "[NGTO Toolkit]Ignore Air: " + !isIgnoreAir);
        updateNGTOCache = true;
    }

    //右クリックで視線先の座標を追加
    if (isRightClick) {
        const pos = NGTOBuilderUtilClient.getLookingPos(); //視線先の座標情報 (情報がないときはnullが入っている)
        if (pos) {
            collector.add(entity, [pos.blockX, pos.blockY, pos.blockZ], false); //コレクタに座標を追加
            updateNGTOCache = true;
        }
    }

    //左クリックで最後に追加した座標を削除する
    if (isLeftClick) {
        collector.pop(entity);//コレクタから最後の座標を削除
        updateNGTOCache = true;
    }

    //選択をすべて解除する
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.clear)) {
        collector.clear(entity);//コレクタの中身をすべて削除
        updateNGTOCache = true;
    }

    //生成する
    const player = MCWrapperClient.getPlayer();
    const currentBlockSet = NGTOBuilderUtil.getHeldBlockSet(player);
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.build) && currentBlockSet) {
        const selectedPosList = collector.getAll(entity);
        NGTOBuilderUtil.sendJsonData(dataMap, "sendData", selectedPosList);
    }

    //Undo
    const isUndo = dataMap.getBoolean("isUndo");
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.undo) && !isUndo) {
        dataMap.setBoolean("isUndo", true, 1);
    }

    //updateNGTOCacheの更新
    const prevUpdateNGTOCache = dataMap.getBoolean("updateNGTOCache");
    if (updateNGTOCache !== prevUpdateNGTOCache) {
        dataMap.setBoolean("updateNGTOCache", updateNGTOCache, 1);
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
}
function initParts(): void {
    //## 描画パーツの設定 ##
    body = renderer.registerParts(new Parts("body"));
    point = renderer.registerParts(new Parts("point"));
    selected = renderer.registerParts(new Parts("selected"));
    placeBlockFrame = renderer.registerParts(new Parts("placeBlockFrame"));
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

    //カーソルを描画
    if (lookingPos) {
        GL11.glPushMatrix();
        GL11.glTranslatef(lookingPos.blockX + 0.5, lookingPos.blockY + 0.5, lookingPos.blockZ + 0.5);
        GL11.glTranslatef(-posX, -posY, -posZ);
        point.render(renderer);
        GL11.glPopMatrix();
    }

    //選択済み座標を描画
    const selectedPosList = collector.getAll(entity);
    selectedPosList.forEach(([x, y, z]: number[]) => {
        GL11.glPushMatrix();
        GL11.glTranslatef(x + 0.5, y + 0.5, z + 0.5);
        GL11.glTranslatef(-posX, -posY, -posZ);
        selected.render(renderer);
        GL11.glPopMatrix();
    });

    //ブロック設置位置を描画
    /*
    if (selectedPosList.length > 0) {
        const ngtoCache = NGTOBuilderUtil.getNGTOCache(entity, "renderNGTO");
        const updateNGTOCache = dataMap.getBoolean("updateNGTOCache");
        const isIgnoreAir = dataMap.getBoolean("isIgnoreAir");
        const basePos = selectedPosList[0];//基準座標

        //ブロックの設置座標を更新する
        if (!ngtoCache || updateNGTOCache) {
            //NGTOを生成する
            const buildPosList = NGTOBuilderUtil.createCylinderPosList(3, 1);//相対座標リストを生成（この例では半径3、高さ1の円柱の座標リストを生成）
            const ngto = NGTOBuilderUtil.createNGTO(new BlockSet(Blocks.stone, 0), buildPosList);//ブロックと相対座標リストからNGTOを生成 ブロックセットは計算用のダミーなので、実際には何のブロックでもOK

            //生成したNGTOをposListの複数の座標に設置するため、NGTOを合成して新しいNGTOを生成する
            const offsetPosList = selectedPosList.map(pos => [pos[0] - basePos[0], pos[1] - basePos[1], pos[2] - basePos[2]]);//posListの座標を相対座標に変換
            const ngtoList: combineNGTOList[] = offsetPosList.map(offset => [ngto, offset[0], offset[1], offset[2]] as combineNGTOList);//combineNGTOは[NGTO, offsetX, offsetY, offsetZ]の形式なので、offsetPosListをcombineNGTOListの形式に変換
            const combinedNGTO = NGTOBuilderUtil.combineNGTO(ngtoList);//NGTOを合成して新しいNGTOを生成

            //NGTOをキャッシュに保存
            NGTOBuilderUtil.setNGTOCache(entity, "renderNGTO", combinedNGTO);

            //updateNGTOCacheの更新
            dataMap.setBoolean("updateNGTOCache", false, 0);
        }

        if (ngtoCache) {
            //NGTOを座標リストに変換(同じNGTO/座標の組み合わせはキャッシュから取得してくれます)
            const placeBlockPosList = NGTOBuilderUtil.createExpectedPosList(ngtoCache, basePos[0], basePos[1], basePos[2], isIgnoreAir);

            //ブロック設置位置を描画(同じ座標リストはキャッシュからStatic描画してくれます)
            GL11.glPushMatrix();
            GL11.glTranslatef(-posX, -posY, -posZ);
            NGTOBuilderUtilClient.renderPlaceBlocksStatic(renderer, entity, placeBlockPosList);
            GL11.glPopMatrix();
        }
    }
    */
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
    if (hostPlayer === null) return;
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
        if (!isOpenGUI && pass === 0 && renderer.currentMatId === 0) keyInput(hostPlayer, entity, (!prevIsRightClick && isRightClick), (!prevIsLeftClick && isLeftClick));
        renderForToolUser(entity, pass, par3);
    }
}