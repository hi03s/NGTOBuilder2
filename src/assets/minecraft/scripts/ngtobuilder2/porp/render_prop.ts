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
import { Vec3 } from "jp.ngt.ngtlib.math";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { BlockSet, NGTObject } from "jp.ngt.ngtlib.block";
import { Blocks } from "net.minecraft.init";
import { RotatableBlockObject } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObject";
import { BlockDiffusionMode, RotatableBlockObjectMapper } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectMapper";
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

        //生成を中止
        cancelBuild: Keyboard.KEY_BACK,

        //Undo
        undo: Keyboard.KEY_Z,

        //ヘルプをチャットに表示
        showHelp: Keyboard.KEY_H,

        //設置高さ変更(俯瞰モード)
        posYUp: Keyboard.KEY_UP,
        posYDown: Keyboard.KEY_DOWN,

        //設置高さ/角度/鏡像リセット(俯瞰モード)
        resetPos: Keyboard.KEY_C,

        //回転(俯瞰モード)
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

        //横回転(仮置きモード)
        rotationYawL: Keyboard.KEY_LEFT,
        rotationYawR: Keyboard.KEY_RIGHT,

        //縦回転(仮置きモード)
        rotationPitchUp: Keyboard.KEY_UP,
        rotationPitchDown: Keyboard.KEY_DOWN,

        //ロール回転(仮置きモード) [+optionキー]
        rotationRollL: Keyboard.KEY_LEFT,
        rotationRollR: Keyboard.KEY_RIGHT,

        //補間の拡散量を変更 [+optionキー]
        diffusionRateUp: Keyboard.KEY_UP,
        diffusionRateDown: Keyboard.KEY_DOWN,

        //ミラー
        mirrorX: Keyboard.KEY_J,
        mirrorY: Keyboard.KEY_K,
        mirrorZ: Keyboard.KEY_L
    }

    //-------------------
    //--  ユーザー設定  --
    //-------------------

    collector = new PositionCollector();
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
    switchInterpolationMode: number;
    diffusionRateUp: number;
    diffusionRateDown: number;
    cancelBuild: number;
    mirrorX: number;
    mirrorY: number;
    mirrorZ: number;
};
var snapAngleList: number[];
var Version: string;
var collector: PositionCollector;
var quaternionManager: HashMap<Entity, Quaternion>;
var posListCache: HashMap<string, Pos[]>;
var prevNGTOData: HashMap<Entity, NGTObject | null>;

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
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "showHelp", keyMap.showHelp)) {
        NGTLog.sendChatMessage(sender, `---NGTO Builder2 プロップ設置 操作方法---`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.endEdit)}] ツールを終了`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.changeSnap)}] スナップ角度を変更`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.setRandomAngle)}] Yaw角度をランダムにセット`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.setToPlayerAngle)}] 角度をプレイヤーの方向にセット`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.isPlaceAirBlock)}] 空気ブロックの設置を切り替え`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.isWorldAxis)}] 回転軸の基準を切り替え`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.switchInterpolationMode)}] ブロック補間モードを切り替え`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.diffusionRateUp)}] 補間の拡散量を増やす`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.diffusionRateDown)}] 補間の拡散量を減らす`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.build)}] 手に持っているNGTOを生成する`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.undo)}] Undo`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.option)} + ${Keyboard.getKeyName(keyMap.cancelBuild)}] 生成を中止する`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.mirrorX)}] X軸の鏡像の切り替え`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.mirrorY)}] Y軸の鏡像の切り替え`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.mirrorZ)}] Z軸の鏡像の切り替え`);
        NGTLog.sendChatMessage(sender, `---俯瞰モード---`);
        NGTLog.sendChatMessage(sender, `[右クリック] 仮置きする`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.posYUp)}] Y高さを上げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.posYDown)}] Y高さを下げる`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.resetPos)}] Y高さ/回転/鏡像をリセット`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.rotationL)}] 左回転`);
        NGTLog.sendChatMessage(sender, `[${Keyboard.getKeyName(keyMap.rotationR)}] 右回転`);
        NGTLog.sendChatMessage(sender, `---仮置きモード---`);
        NGTLog.sendChatMessage(sender, `[左クリック] 仮置きを解除`);
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
        collector.add(entity, lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ, true);
    }

    //回転モードを解除
    if (isLeftClick) collector.clear(entity);

    //スナップ角度を変更
    let snapAngle = dataMap.getInt("snapAngle");
    if (snapAngle === 0) {
        snapAngle = snapAngleList[0];
        dataMap.setInt("snapAngle", snapAngle, 0);
    }
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "changeSnap", keyMap.changeSnap)) {
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
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] スナップ角度: ${snapAngle}`)
    }

    //Yaw角度をランダムにセット
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "setRandomAngle", keyMap.setRandomAngle)) {
        const randomAngle = Math.random() * 360;
        const newQuaternion = Quaternion.fromEuler(randomAngle, 0, 0);
        quaternion = newQuaternion.multiply(quaternion);//ワールド上のYaw回転
        quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true);//Y軸スナップ
        //保存
        quaternionManager.put(entity, quaternion.normalizeSelf());
    }

    //角度をプレイヤーの方向にセット
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "setToPlayerAngle", keyMap.setToPlayerAngle)) {
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
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "isPlaceAirBlock", keyMap.isPlaceAirBlock)) {
        let isPlaceAirBlock = dataMap.getBoolean("isPlaceAirBlock");
        isPlaceAirBlock = !isPlaceAirBlock;
        dataMap.setBoolean("isPlaceAirBlock", isPlaceAirBlock, 1);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] 空気ブロック設置: ${isPlaceAirBlock}`);
    }

    //回転モードを切り替え
    let isWorldAxis = dataMap.getBoolean("isWorldAxis");
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "isWorldAxis", keyMap.isWorldAxis)) {
        isWorldAxis = !isWorldAxis;
        dataMap.setBoolean("isWorldAxis", isWorldAxis, 0);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] 回転軸: ${isWorldAxis ? "ワールド軸" : "ローカル軸"}`);
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
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "diffusionRateUp", keyMap.diffusionRateUp) && Keyboard.isKeyDown(keyMap.option) && diffusionRate < 100) {
        diffusionRate = diffusionRate + 5;
        dataMap.setInt("diffusionRate", diffusionRate, 1);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] 補間の拡散量: ${diffusionRate / 100}[m]`);
    }
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "diffusionRateDown", keyMap.diffusionRateDown) && Keyboard.isKeyDown(keyMap.option) && diffusionRate > 5) {
        diffusionRate = diffusionRate - 5;
        dataMap.setInt("diffusionRate", diffusionRate, 1);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] 補間の拡散量: ${diffusionRate / 100}[m]`);
    }

    type SendData = {
        q: [w: number, x: number, y: number, z: number],
        pos: Pos
    }
    //NGTOを生成する
    const ngto = NGTOBuilderUtil.getHeldNGTO(hostPlayer);
    const isBuilding = dataMap.getBoolean("isBuilding");
    const isUndo = dataMap.getBoolean("isUndo");
    let buildPos = null;
    if (collector.size(entity) > 0) buildPos = collector.getAll(entity)[0] as Pos;
    else if (lookingPos) buildPos = [lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ] as Pos;
    if (buildPos?.length === 3 && !isBuilding && !isUndo && ngto && NGTOBuilderUtilClient.isKeyDown(dataMap, "build", keyMap.build)) {
        dataMap.setBoolean("isBuilding", true, 1);
        const sendData: SendData = {
            q: [quaternion.w, quaternion.x, quaternion.y, quaternion.z],
            pos: buildPos
        }
        NGTOBuilderUtil.sendJsonData(dataMap, "sendData", sendData);
        NGTLog.sendChatMessage(sender, "[NGTO Builder2] 生成中...");
    }

    //生成を中止する
    if (isBuilding && NGTOBuilderUtilClient.isKeyDown(dataMap, "cancelBuild", keyMap.cancelBuild) && Keyboard.isKeyDown(keyMap.option)) {
        NGTLog.sendChatMessage(sender, "[NGTO Builder2] 生成を中止");
        dataMap.setBoolean("cancelBuild", true, 1);
    }

    //Undo
    const canUndo = dataMap.getBoolean("canUndo");
    if (canUndo && !isBuilding && !isUndo && NGTOBuilderUtilClient.isKeyDown(dataMap, "undo", keyMap.undo) && Keyboard.isKeyDown(keyMap.option)) {
        dataMap.setBoolean("isUndo", true, 1);
        NGTLog.sendChatMessage(sender, "[NGTO Builder2] Undo...");
    }

    //X鏡像
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "mirrorX", keyMap.mirrorX)) {
        let isMirrorX = dataMap.getBoolean("isMirrorX");
        isMirrorX = !isMirrorX
        dataMap.setBoolean("isMirrorX", isMirrorX, 1);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] X鏡像: ${isMirrorX}`);
    }

    //Y鏡像
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "mirrorY", keyMap.mirrorY)) {
        let isMirrorY = dataMap.getBoolean("isMirrorY");
        isMirrorY = !isMirrorY
        dataMap.setBoolean("isMirrorY", isMirrorY, 1);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] Y鏡像: ${isMirrorY}`);
    }

    //Z鏡像
    if (NGTOBuilderUtilClient.isKeyDown(dataMap, "mirrorZ", keyMap.mirrorZ)) {
        let isMirrorZ = dataMap.getBoolean("isMirrorZ");
        isMirrorZ = !isMirrorZ
        dataMap.setBoolean("isMirrorZ", isMirrorZ, 1);
        NGTLog.sendChatMessage(sender, `[NGTO Builder2] Z鏡像: ${isMirrorZ}`);
    }

    //--設置モード--
    if (collector.size(entity) === 0) {
        //設置高さ変更
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, "posYUp", keyMap.posYUp)) {
            dataMap.setInt("offsetY", offsetY + 1, 1);
        }
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, "posYDown", keyMap.posYDown)) {
            dataMap.setInt("offsetY", offsetY - 1, 1);
        }

        //設置高さ/角度/鏡像リセット
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, "resetPos", keyMap.resetPos)) {
            dataMap.setInt("offsetY", 0, 1);
            quaternion = new Quaternion();
            quaternionManager.put(entity, quaternion);
            dataMap.setBoolean("isMirrorX", false, 1);
            dataMap.setBoolean("isMirrorY", false, 1);
            dataMap.setBoolean("isMirrorZ", false, 1);
        }

        //回転
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, "rotationL", keyMap.rotationL) ||
            NGTOBuilderUtilClient.isKeyDownLong(dataMap, "rotationL", keyMap.rotationL, 500)) {
            const newQuaternion = Quaternion.fromEuler(snapAngle, 0, 0);
            quaternion = newQuaternion.multiply(quaternion);//ワールド上のYaw回転
            quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true);//Y軸スナップ
            quaternionManager.put(entity, quaternion.normalizeSelf());
        }
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, "rotationR", keyMap.rotationR) ||
            NGTOBuilderUtilClient.isKeyDownLong(dataMap, "rotationR", keyMap.rotationR, 500)) {
            const newQuaternion = Quaternion.fromEuler(-snapAngle, 0, 0);
            quaternion = newQuaternion.multiply(quaternion);//ワールド上のYaw回転
            quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true);//Y軸スナップ
            quaternionManager.put(entity, quaternion.normalizeSelf());
        }

    }
    //--回転モード--
    else {
        //回転をリセット
        if (NGTOBuilderUtilClient.isKeyDown(dataMap, "resetRotation", keyMap.resetRotation)) {
            quaternion = new Quaternion();
            quaternionManager.put(entity, quaternion);
        }

        if (Keyboard.isKeyDown(keyMap.option)) {
            //ロール回転
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, "rotationRollL", keyMap.rotationRollL) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, "rotationRollL", keyMap.rotationRollL, 500)) {
                const newQuaternion = Quaternion.fromEuler(0, 0, -snapAngle);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapRollDelta(quaternion, snapAngle, isWorldAxis);//Rollスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, "rotationRollR", keyMap.rotationRollR) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, "rotationRollR", keyMap.rotationRollR, 500)) {
                const newQuaternion = Quaternion.fromEuler(0, 0, snapAngle);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapRollDelta(quaternion, snapAngle, isWorldAxis);//Rollスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }
        }
        else {
            //横回転
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, "rotationYawL", keyMap.rotationYawL) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, "rotationYawL", keyMap.rotationYawL, 500)) {
                const newQuaternion = Quaternion.fromEuler(snapAngle, 0, 0);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, isWorldAxis);//Yawスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, "rotationYawR", keyMap.rotationYawR) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, "rotationYawR", keyMap.rotationYawR, 500)) {
                const newQuaternion = Quaternion.fromEuler(-snapAngle, 0, 0);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, isWorldAxis);//Yawスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }

            //縦回転
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, "rotationPitchUp", keyMap.rotationPitchUp) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, "rotationPitchUp", keyMap.rotationPitchUp, 500)) {
                const newQuaternion = Quaternion.fromEuler(0, -snapAngle, 0);
                if (isWorldAxis) quaternion = newQuaternion.multiply(quaternion);//ワールド軸の回転
                else quaternion = quaternion.multiply(newQuaternion);//ローカル軸の回転
                quaternion = Quaternion.snapPitchDelta(quaternion, snapAngle, isWorldAxis);//Pitchスナップ
                quaternionManager.put(entity, quaternion.normalizeSelf());
            }
            if (NGTOBuilderUtilClient.isKeyDown(dataMap, "rotationPitchDown", keyMap.rotationPitchDown) ||
                NGTOBuilderUtilClient.isKeyDownLong(dataMap, "rotationPitchDown", keyMap.rotationPitchDown, 500)) {
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
var mirrorX: Parts;
var mirrorY: Parts;
var mirrorZ: Parts;

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
    mirrorX = renderer.registerParts(new Parts("mirrorX"));
    mirrorY = renderer.registerParts(new Parts("mirrorY"));
    mirrorZ = renderer.registerParts(new Parts("mirrorZ"));
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
    let prevNGTO = prevNGTOData.get(entity);
    prevNGTOData.put(entity, ngto);
    const isMirrorX = dataMap.getBoolean("isMirrorX");
    const isMirrorY = dataMap.getBoolean("isMirrorY");
    const isMirrorZ = dataMap.getBoolean("isMirrorZ");
    let scale = 1;
    if (ngto) scale = Math.max(ngto.xSize, ngto.ySize, ngto.zSize) * 1.3;
    if (ngto && q && !isBuilding && !isUndo) {
        let selectedPos = null;
        if (collector.size(entity) > 0) selectedPos = collector.getAll(entity)[0];
        else if (lookingPos) selectedPos = [lookingPos.blockX, lookingPos.blockY + offsetY, lookingPos.blockZ];
        if (selectedPos) {
            const centerX2 = ngto.xSize / 2;
            const centerY2 = ngto.ySize / 2;
            const centerZ2 = ngto.zSize / 2;
            const centerX = Math.floor(centerX2) + 0.5;
            const centerZ = Math.floor(centerZ2) + 0.5;
            GL11.glPushMatrix();
            GL11.glTranslatef(selectedPos[0] + 0.5, selectedPos[1] + 0.5, selectedPos[2] + 0.5);
            GL11.glTranslatef(-posX, -posY, -posZ);
            NGTOBuilderUtilClient.glApplyQuaternionMatrix(q);
            GL11.glTranslatef(-centerX, -0.5, -centerZ);

            //NGTO 鏡像表示に対応する
            GL11.glPushMatrix();
            GL11.glDisable(GL11.GL_CULL_FACE);
            GL11.glTranslatef(centerX2, centerY2, centerZ2);
            if (isMirrorX) GL11.glScalef(-1, 1, 1);
            if (isMirrorY) GL11.glScalef(1, -1, 1);
            if (isMirrorZ) GL11.glScalef(1, 1, -1);
            GL11.glTranslatef(-centerX2, -centerY2, -centerZ2);
            NGTOBuilderUtilClient.renderNGTO(prevNGTO !== ngto, entity, renderer, ngto, pass);
            GL11.glEnable(GL11.GL_CULL_FACE);
            GL11.glPopMatrix();

            //鏡像マーカー
            GL11.glTranslatef(centerX, 0.5, centerZ);
            if (isMirrorX) renderWithScale(mirrorX, scale, scale, scale);
            if (isMirrorY) renderWithScale(mirrorY, scale, scale, scale);
            if (isMirrorZ) renderWithScale(mirrorZ, scale, scale, scale);
            GL11.glPopMatrix();
        }
    }

    //ブロックフレームを描画
    if (ngto && q && !isBuilding) {
        const diffusionRate = dataMap.getInt("diffusionRate");
        const isPlaceAirBlock = dataMap.getBoolean("isPlaceAirBlock");
        const interpolationMode = dataMap.getInt("interpolationMode");
        const isMirrorX = dataMap.getBoolean("isMirrorX");
        const isMirrorY = dataMap.getBoolean("isMirrorY");
        const isMirrorZ = dataMap.getBoolean("isMirrorZ");
        const entityId = String(entity.getEntityId());
        const ngtoHash = NGTOBuilderUtil.getNGTOHash(ngto);
        const qHash = q.getHash();
        const hash = entityId + ngtoHash + qHash + String(interpolationMode) + String(isPlaceAirBlock) + String(diffusionRate) + String(isMirrorX) + String(isMirrorY) + String(isMirrorZ);
        let posList = posListCache.get(hash);//相対座標で管理
        if (!posList) {
            let centerX = Math.floor(ngto.xSize / 2) + 0.5;
            let centerZ = Math.floor(ngto.zSize / 2) + 0.5;
            if ((ngto.xSize * ngto.ySize * ngto.zSize) > 20000 ||
                (interpolationMode === 1 && (ngto.xSize * ngto.ySize * ngto.zSize * 8) > 20000)) {
                //巨大ブロックは代替表示
                const hugePosList = NGTOBuilderUtilClient.getOutsideFramePosList(ngto);
                const blockObj = RotatableBlockObject.createFromPosList(hugePosList);
                if (isMirrorX) blockObj.mirrorX();
                if (isMirrorZ) blockObj.mirrorZ();
                if (isMirrorY) blockObj.mirrorY();
                blockObj.setPivot(centerX, 0.5, centerZ);
                blockObj.rotateQ(q);
                blockObj.movePivotToBaseXZ();
                RotatableBlockObjectMapper.toBlockCoordSelf(blockObj);
                posList = RotatableBlockObjectMapper.getPosList(blockObj);
            }
            else {
                //posListを生成
                const diffusion = BlockDiffusionMode.get(interpolationMode).withRate(diffusionRate / 100);
                const blockObj = RotatableBlockObject.createFromNGTO(ngto, isPlaceAirBlock);
                if (isMirrorX) blockObj.mirrorX();
                if (isMirrorZ) blockObj.mirrorZ();
                if (isMirrorY) blockObj.mirrorY();
                blockObj.setPivot(centerX, 0.5, centerZ);
                blockObj.rotateQ(q);
                blockObj.movePivotToBaseXZ();
                if (!q.isRightAngleRotation()) RotatableBlockObjectMapper.applyDiffusionSelf(blockObj, diffusion);
                RotatableBlockObjectMapper.toBlockCoordSelf(blockObj);
                posList = RotatableBlockObjectMapper.getPosList(blockObj);
            }
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
            NGTOBuilderUtilClient.renderPosListStatic(renderer, placeBlockFrame, entity, posList);
            GL11.glPopMatrix();
        }
    }

    //回転ハンドル
    if (q && !isBuilding) {
        const isWorldAxis = dataMap.getBoolean("isWorldAxis");
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
var isKaizPatch: boolean;
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