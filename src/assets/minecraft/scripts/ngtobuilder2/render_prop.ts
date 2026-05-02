import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapper, MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { RTMCore } from "jp.ngt.rtm";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ModelSetVehicle } from "jp.ngt.rtm.modelpack.modelset";
import { ModelObject, Parts, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { ICommandSender } from "net.minecraft.command";
import { EntityPlayer } from "net.minecraft.entity.player";
import { Keyboard, Mouse } from "org.lwjgl.input";
import { NGTOBuilderUtilClient, Pos } from "../lib_hi03toolkit_1_0/lib_NGTOBuilderUtilClient";
import { PositionCollector } from "../lib_hi03toolkit_1_0/lib_PositionCollector";
import { RTMApiCompat } from "../lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { GL11 } from "org.lwjgl.opengl";
import { HashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { Quaternion } from "../lib_hi03toolkit_1_0/lib_Quaternion";
import { Vec3 } from "jp.ngt.ngtlib.math";
import { NGTOBuilderUtil } from "../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { OpenGlHelper } from "net.minecraft.client.renderer";
import { RotatableBlockObject } from "../lib_hi03toolkit_1_0/lib_RotatableBlockObject";
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

    //スナップ角度リスト
    snapAngleList = [5, 15, 45, 90, 1];

    //キー設定 
    keyMap = {
        //オプションキー
        option: Keyboard.KEY_LCONTROL,

        //終了
        endEdit: Keyboard.KEY_Q,

        //生成
        build: Keyboard.KEY_RETURN,

        //Undo
        undo: Keyboard.KEY_Z,

        //ヘルプをチャットに表示
        showHelp: Keyboard.KEY_H,

        //設置高さ変更(設置モード)
        posYUp: Keyboard.KEY_UP,
        posYDown: Keyboard.KEY_DOWN,

        //設置高さ/角度リセット(設置モード)
        resetPos: Keyboard.KEY_C,

        //回転(設置モード)
        rotationL: Keyboard.KEY_LEFT,
        rotationR: Keyboard.KEY_RIGHT,

        //スナップ切り替え
        changeSnap: Keyboard.KEY_P,

        //角度をランダムに設定
        setRandomAngle: Keyboard.KEY_R,

        //角度をプレイヤーの方向に設定
        setToPlayerAngle: Keyboard.KEY_F,

        //空気ブロックの設置を切り替え
        isPlaceAirBlock: Keyboard.KEY_I,

        //回転モードを切り替え
        isWorldAxis: Keyboard.KEY_O,
        
        //補間モード切り替え
        switchInterpolationMode: Keyboard.KEY_U,

        //回転をリセット
        resetRotation: Keyboard.KEY_C,

        //横回転(回転モード)
        rotationYawL: Keyboard.KEY_LEFT,
        rotationYawR: Keyboard.KEY_RIGHT,

        //縦回転(回転モード)
        rotationPitchUp: Keyboard.KEY_UP,
        rotationPitchDown: Keyboard.KEY_DOWN,

        //ロール回転(回転モード) [+optionキー]
        rotationRollL: Keyboard.KEY_LEFT,
        rotationRollR: Keyboard.KEY_RIGHT
    }

    //-------------------
    //--  ユーザー設定  --
    //-------------------

    collector = new PositionCollector();
    quaternionManager = new HashMap();
    posListCache = new HashMap();
    initParts();
}
declare global {
    var keyMap: {
        option: number;
        endEdit: number;
        build: number;
        undo: number;
        showHelp: number;
        posYUp: number;
        posYDown: number;
        rotationL: number;
        rotationR: number;
        changeSnap: number;
        setRandomAngle: number;
        setToPlayerAngle: number;
        isPlaceAirBlock: number;
        rotationYawL: number;
        rotationYawR: number;
        rotationPitchUp: number;
        rotationPitchDown: number;
        rotationRollL: number;
        rotationRollR: number;
        resetRotation: number;
        isWorldAxis: number;
        resetPos: number;
        switchInterpolationMode:number;
    };
    var snapAngleList: number[];
    var Version: string;
    var collector: PositionCollector;
    var quaternionManager: HashMap<Entity, Quaternion>;
    var posListCache: HashMap<string, Pos[]>;
}

function keyInput(hostPlayer: EntityPlayer, entity: EntityVehicle, isRightClick: boolean, isLeftClick: boolean): void {
    const sender = hostPlayer as unknown as ICommandSender;
    const dataMap = entity.getResourceState().getDataMap();
    const lookingPos = NGTOBuilderUtilClient.getLookingPos();
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
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.showHelp)) {
        NGTLog.sendChatMessage(sender, `---NGTO Builder2 Prop設置 操作方法---`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.endEdit)}] ツールを終了`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.changeSnap)}] スナップ角度を変更`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.setRandomAngle)}] Yaw角度をランダムにセット`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.setToPlayerAngle)}] 角度をプレイヤーの方向にセット`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.isPlaceAirBlock)}] 空気ブロックの設置を切り替え`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.build)}] NGTOを生成する`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.undo)}] Undo`);
        NGTLog.sendChatMessage(sender, `---設置モード---`);
        NGTLog.sendChatMessage(sender, `[右クリック] 設置位置を決定(回転モードに移行)`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.posYUp)}] Y高さを上げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.posYDown)}] Y高さを下げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.resetPos)}] Y高さをリセット`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.rotationL)}] 左回転`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.rotationR)}] 右回転`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.resetRotation)}] 回転をリセット`);
        NGTLog.sendChatMessage(sender, `---回転モード---`);
        NGTLog.sendChatMessage(sender, `[左クリック] 回転モードを解除(設置モードに移行)`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.rotationYawL)}] Yaw回転(Left)`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.rotationYawR)}] Yaw回転(Right)`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.rotationPitchUp)}] Pitch回転(Up)`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.rotationPitchDown)}] Pitch回転(Down)`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.rotationRollL)}] Roll回転(Left)`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.rotationRollR)}] Roll回転(Right)`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.resetRotation)}] 回転をリセット`);
    }

    //設置位置を決定(回転モードに移行)
    if (lookingPos && isRightClick) {
        collector.clear(entity);
        collector.add(entity, [lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ], true);
    }

    //回転モードを解除
    if (isLeftClick) collector.clear(entity);

    //スナップ角度を変更
    let snapAngle = dataMap.getInt("snapAngle");
    if (snapAngle === 0) {
        snapAngle = snapAngleList[0];
        dataMap.setInt("snapAngle", snapAngle, 0);
    }
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.changeSnap)) {
        //角度設定
        const currentIdx = snapAngleList.indexOf(snapAngle);
        const maxIdx = snapAngleList.length;
        const newIdx = Keyboard.isKeyDown(keyMap.option) ? (currentIdx - 1 + maxIdx) % maxIdx : (currentIdx + 1) % maxIdx;
        snapAngle = snapAngleList[newIdx];
        dataMap.setInt("snapAngle", snapAngle, 0);
        //現在の角度を変換
        quaternion = Quaternion.snapRollDelta(quaternion, snapAngle, true);//Rollスナップ
        quaternion = Quaternion.snapPitchDelta(quaternion, snapAngle, true);//Pitchスナップ
        quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true);//Yawスナップ
        //保存
        quaternionManager.put(entity, quaternion.normalizeSelf());
        NGTLog.sendChatMessage(sender, `スナップ角度: ${snapAngle}`)
    }

    //Yaw角度をランダムにセット
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.setRandomAngle)) {
        const randomAngle = Math.random() * 360;
        const newQuaternion = Quaternion.fromEuler(randomAngle, 0, 0);
        quaternion = newQuaternion.multiply(quaternion);//ワールド上のYaw回転
        quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true);//Y軸スナップ
        //保存
        quaternionManager.put(entity, quaternion.normalizeSelf());
    }

    //角度をプレイヤーの方向にセット
    if (Keyboard.isKeyDown(keyMap.setToPlayerAngle)) {
        const currentQYaw = quaternion.extractYaw();
        if (collector.size(entity) > 0) {//すでに座標指定済み
            const pos = collector.getAll(entity)[0];
            const playerVec = new Vec3(entity.posX - pos[0] - 0.5, 0, entity.posZ - pos[2] - 0.5);
            const newQuaternion = Quaternion.fromEuler(playerVec.getYaw() - currentQYaw, 0, 0);
            quaternion = newQuaternion.multiply(quaternion);//ワールド上のYaw回転
            quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true);//Y軸スナップ
            //保存
            quaternionManager.put(entity, quaternion.normalizeSelf());
        }
        else if (lookingPos) {
            const playerVec = new Vec3(entity.posX - lookingPos.posX, 0, entity.posZ - lookingPos.posZ);
            const newQuaternion = Quaternion.fromEuler(playerVec.getYaw() - currentQYaw, 0, 0);
            quaternion = newQuaternion.multiply(quaternion);//ワールド上のYaw回転
            quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true);//Y軸スナップ
            //保存
            quaternionManager.put(entity, quaternion.normalizeSelf());
        }
    }

    //空気ブロックの設置を切り替え
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.isPlaceAirBlock)) {
        let isPlaceAirBlock = dataMap.getBoolean("isPlaceAirBlock");
        isPlaceAirBlock = !isPlaceAirBlock;
        dataMap.setBoolean("isPlaceAirBlock", isPlaceAirBlock, 1);
        NGTLog.sendChatMessage(sender, `空気ブロック設置: ${isPlaceAirBlock}`);
    }

    //回転モードを切り替え
    let isWorldAxis = dataMap.getBoolean("isWorldAxis");
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.isWorldAxis)) {
        isWorldAxis = !isWorldAxis;
        dataMap.setBoolean("isWorldAxis", isWorldAxis, 0);
        NGTLog.sendChatMessage(sender, `回転軸: ${isWorldAxis ? "ワールド軸" : "ローカル軸"}`);
    }

    //補間モードを切り替え
    let interpolationMode = dataMap.getInt("interpolationMode");
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.switchInterpolationMode)) {
        interpolationMode = (interpolationMode + 1) % 2;
        dataMap.setInt("interpolationMode", interpolationMode, 1);
        let modeName = "";
        if (interpolationMode === 0) modeName = "補間なし";
        if (interpolationMode === 1) modeName = "座標拡散";
        NGTLog.sendChatMessage(sender, `補間モード: ${modeName}`);
    }

    //NGTOを生成する

    //Undo

    //--設置モード--
    if (collector.size(entity) === 0) {
        //設置高さ変更
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.posYUp)) {
            dataMap.setInt("offsetY", offsetY + 1, 1);
        }
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.posYDown)) {
            dataMap.setInt("offsetY", offsetY - 1, 1);
        }

        //設置高さ/角度リセット
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.resetPos)) {
            dataMap.setInt("offsetY", 0, 1);
            quaternion = new Quaternion();
            quaternionManager.put(entity, quaternion);
        }

        //回転
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.rotationL) ||
            NGTOBuilderUtilClient.isKeyDownLong(dataMap, keyMap.rotationL, 500)) {
            const newQuaternion = Quaternion.fromEuler(snapAngle, 0, 0);
            quaternion = newQuaternion.multiply(quaternion);//ワールド上のYaw回転
            quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true);//Y軸スナップ
            quaternionManager.put(entity, quaternion.normalizeSelf());
        }
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.rotationR) ||
            NGTOBuilderUtilClient.isKeyDownLong(dataMap, keyMap.rotationR, 500)) {
            const newQuaternion = Quaternion.fromEuler(-snapAngle, 0, 0);
            quaternion = newQuaternion.multiply(quaternion);//ワールド上のYaw回転
            quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true);//Y軸スナップ
            quaternionManager.put(entity, quaternion.normalizeSelf());
        }

    }
    //--回転モード--
    else {
        //回転をリセット
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.resetRotation)) {
            quaternion = new Quaternion();
            quaternionManager.put(entity, quaternion);
        }

        if (Keyboard.isKeyDown(keyMap.option)) {
            //ロール回転
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.rotationRollL) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, keyMap.rotationRollL, 500)) {
                const newQuaternion = Quaternion.fromEuler(0, 0, -snapAngle);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapRollDelta(quaternion, snapAngle, isWorldAxis);//Rollスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.rotationRollR) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, keyMap.rotationRollR, 500)) {
                const newQuaternion = Quaternion.fromEuler(0, 0, snapAngle);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapRollDelta(quaternion, snapAngle, isWorldAxis);//Rollスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }
        }
        else {
            //横回転
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.rotationYawL) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, keyMap.rotationYawL, 500)) {
                const newQuaternion = Quaternion.fromEuler(snapAngle, 0, 0);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, isWorldAxis);//Yawスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.rotationYawR) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, keyMap.rotationYawR, 500)) {
                const newQuaternion = Quaternion.fromEuler(-snapAngle, 0, 0);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, isWorldAxis);//Yawスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }

            //縦回転
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.rotationPitchUp) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, keyMap.rotationPitchUp, 500)) {
                const newQuaternion = Quaternion.fromEuler(0, -snapAngle, 0);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapPitchDelta(quaternion, snapAngle, isWorldAxis);//Pitchスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, keyMap.rotationPitchDown) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, keyMap.rotationPitchDown, 500)) {
                const newQuaternion = Quaternion.fromEuler(0, snapAngle, 0);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapPitchDelta(quaternion, snapAngle, isWorldAxis);//Pitchスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }
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
    var handleX: Parts;
    var handleY: Parts;
    var handleZ: Parts;
    var axisX: Parts;
    var axisY: Parts;
    var axisZ: Parts;
    var test: Parts;
}
function initParts(): void {
    //## 描画パーツの設定 ##
    body = renderer.registerParts(new Parts("body"));
    point = renderer.registerParts(new Parts("point"));
    selected = renderer.registerParts(new Parts("selected"));
    placeBlockFrame = renderer.registerParts(new Parts("placeBlockFrame"));
    handleX = renderer.registerParts(new Parts("handleX"));
    handleY = renderer.registerParts(new Parts("handleY"));
    handleZ = renderer.registerParts(new Parts("handleZ"));
    axisX = renderer.registerParts(new Parts("axisX"));
    axisY = renderer.registerParts(new Parts("axisY"));
    axisZ = renderer.registerParts(new Parts("axisZ"));
    test = renderer.registerParts(new Parts("test"));
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

    //カーソル
    if (lookingPos) {
        GL11.glPushMatrix();
        GL11.glTranslatef(lookingPos.blockX + 0.5, lookingPos.blockY + 0.5 + offsetY, lookingPos.blockZ + 0.5);
        GL11.glTranslatef(-posX, -posY, -posZ);
        point.render(renderer);
        GL11.glPopMatrix();
    }

    //選択済み座標
    if (collector.size(entity) > 0) {
        const selectedPos = collector.getAll(entity)[0];
        GL11.glPushMatrix();
        GL11.glTranslatef(selectedPos[0] + 0.5, selectedPos[1] + 0.5, selectedPos[2] + 0.5);
        GL11.glTranslatef(-posX, -posY, -posZ);
        selected.render(renderer);
        GL11.glPopMatrix();
    }

    //NGTOを描画
    const ngto = NGTOBuilderUtil.getHeldNGTO(player);
    const q = quaternionManager.get(entity);
    if (ngto && q) {
        let selectedPos = null;
        if (collector.size(entity) > 0) selectedPos = collector.getAll(entity)[0];
        else if (lookingPos) selectedPos = [lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ];
        if (selectedPos) {
            let centerX = Math.floor(ngto.xSize / 2) + 0.5;
            let centerZ = Math.floor(ngto.zSize / 2) + 0.5;
            GL11.glPushMatrix();
            GL11.glTranslatef(selectedPos[0] + 0.5, selectedPos[1], selectedPos[2] + 0.5);
            GL11.glTranslatef(-posX, -posY, -posZ);
            NGTOBuilderUtilClient.glApplyQuaternionMatrix(q);
            GL11.glTranslatef(-centerX, 0, -centerZ);
            NGTOBuilderUtilClient.renderNGTO(renderer, ngto, pass);
            GL11.glPopMatrix();
        }
    }

    //ブロックフレームを描画
    if (ngto && q) {
        const interpolationMode = dataMap.getInt("interpolationMode");
        const isPlaceAirBlock = dataMap.getBoolean("isPlaceAirBlock");
        const entityId = String(entity.getEntityId());
        const ngtoHash = NGTOBuilderUtil.getNGTOHash(ngto);
        const qHash = q.getHash();
        const hash = entityId + ngtoHash + qHash + String(isPlaceAirBlock) + String(interpolationMode);
        let posList = posListCache.get(hash);//相対座標で管理
        if (!posList) {
            let centerX = Math.floor(ngto.xSize / 2) + 0.5;
            let centerZ = Math.floor(ngto.zSize / 2) + 0.5;
            //posListを生成
            const blockObj = RotatableBlockObject.createFromNGTO(ngto);
            if (!isPlaceAirBlock) blockObj.removeAirBlock();
            blockObj.setRotationAxisPos(centerX, 0, centerZ);
            blockObj.rotate(interpolationMode, q);
            blockObj.toBlockPos();
            posList = blockObj.getPlacePosList(0, 0, 0);//(0, 0, 0)で相対座標として生成
            posListCache.put(hash, posList);
        }
        //描画
        let selectedPos = null;
        if (collector.size(entity) > 0) selectedPos = collector.getAll(entity)[0];
        else if (lookingPos) selectedPos = [lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ];
        if (selectedPos) {
            GL11.glPushMatrix();
            GL11.glTranslatef(selectedPos[0] + 0.5, selectedPos[1] + 0.5, selectedPos[2] + 0.5);
            GL11.glTranslatef(-posX, -posY, -posZ);
            NGTOBuilderUtilClient.renderPlaceBlocksStatic(renderer, "placeBlockFrame", entity, posList);
            GL11.glPopMatrix();
        }
    }

    //回転ハンドル
    if (q) {
        const isWorldAxis = dataMap.getBoolean("isWorldAxis");
        let scale = 1;
        if (ngto) scale = Math.max(ngto.xSize, ngto.ySize, ngto.zSize) * 1.33;
        let selectedPos = null;
        if (collector.size(entity) > 0) selectedPos = collector.getAll(entity)[0];
        else if (lookingPos) selectedPos = [lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ];
        if (selectedPos) {
            //回転軸
            GL11.glPushMatrix();
            GL11.glTranslatef(selectedPos[0] + 0.5, selectedPos[1] + 0.5, selectedPos[2] + 0.5);
            GL11.glTranslatef(-posX, -posY, -posZ);
            if (!isWorldAxis) NGTOBuilderUtilClient.glApplyQuaternionMatrix(q);
            renderWithScale(axisX, scale, 1, 1);
            renderWithScale(axisY, 1, scale, 1);
            renderWithScale(axisZ, 1, 1, scale);
            //回転ハンドル
            let alphaX = 0.2;
            let alphaY = 0.2;
            let alphaZ = 0.2;
            if (collector.size(entity) > 0) {
                if (Keyboard.isKeyDown(keyMap.option)) {
                    if (Keyboard.isKeyDown(keyMap.rotationRollL) || Keyboard.isKeyDown(keyMap.rotationRollR)) alphaZ = 1;
                }
                else {
                    if (Keyboard.isKeyDown(keyMap.rotationYawL) || Keyboard.isKeyDown(keyMap.rotationYawR)) alphaY = 1;
                    if (Keyboard.isKeyDown(keyMap.rotationPitchUp) || Keyboard.isKeyDown(keyMap.rotationPitchDown)) alphaX = 1;
                }
            }
            else {
                if (Keyboard.isKeyDown(keyMap.rotationL) || Keyboard.isKeyDown(keyMap.rotationR)) alphaY = 1;
            }
            GL11.glScalef(scale, scale, scale);
            renderWithAlpha(handleX, alphaX);
            renderWithAlpha(handleY, alphaY);
            renderWithAlpha(handleZ, alphaZ);
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
    GL11.glDisable(GL11.GL_ALPHA_TEST);
    GL11.glEnable(GL11.GL_BLEND);
    OpenGlHelper.glBlendFunc(GL11.GL_SRC_ALPHA, GL11.GL_ONE_MINUS_SRC_ALPHA, 1, 0);
    GL11.glColor4f(1.0, 1.0, 1.0, alpha);
    part.render(renderer);
    GL11.glColor4f(1.0, 1.0, 1.0, 1.0);
    GL11.glDisable(GL11.GL_BLEND);
    GL11.glEnable(GL11.GL_ALPHA_TEST);
}

function renderWithScale(part: Parts, scaleX: number, scaleY: number, scaleZ: number): void {
    GL11.glPushMatrix();
    GL11.glScalef(scaleX, scaleY, scaleZ);
    part.render(renderer);
    GL11.glPopMatrix();
}