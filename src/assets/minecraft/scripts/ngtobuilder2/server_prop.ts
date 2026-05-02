import { RTMCore } from "jp.ngt.rtm";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ScriptExecuter } from "jp.ngt.rtm.modelpack";
import { Blocks } from "net.minecraft.init";
import { WeakHashMap } from "java.util";
import { BlockSet } from "jp.ngt.ngtlib.block";
import { combineNGTOList, NGTOBuilderUtil, Pos } from "./lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { RTMApiCompat } from "./lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { BlockBuilder } from "./lib_hi03toolkit_1_0/lib_BlockBuilder";
import { EntityPlayer } from "net.minecraft.entity.player";
import { UndoManager } from "./lib_hi03toolkit_1_0/lib_UndoManager";

//#################################
//##  hi03式エディターツール v1.0  ##
//#################################
/*
NGTO BuilderやSuperRailBuilder3のような自動車モデル型のエディターツールの雛形です
キー入力はクライアント側で行い、ブロック変更などのワールド処理はサーバー側が担当します
不要なコメントアウトはすべて消してください
テスト用の機能が記述されているので、不要な部分は消してください
*/

//バージョンチェック
//クライアント側とバージョンチェックを行います ※一致していなくても利用自体はできます
Version = "1.0";

//#################
//##  初期化処理  ##
//#################
//スポーン時や再使用時に実行されます

declare global {
    //## グローバル変数として使うための準備 ##
    var builder: BlockBuilder;
}
function init(entity: EntityVehicle, scriptExecuter: ScriptExecuter): void {
    const dataMap = entity.getResourceState().getDataMap();
    const isInitializedServer = dataMap.getBoolean("isInitializedServer");
    if (isInitializedServer) return;
    dataMap.setBoolean("isInitializedServer", true, 1);

    //ブロック生成用のBlockBuilder
    if (!builder) builder = new BlockBuilder();
    else builder.clear(entity);

    //dataMapのリセット
    dataMap.setBoolean("buildComplete", false, 1);
    dataMap.setBoolean("isInitializedBuild", false, 1);
}

//############
//##  処理  ##
//############
//JSON(sendData)から送られてくるデータの型
type ReceiveData = number[][];//[[x, y, z], ...]

function onUpdate2(entity: EntityVehicle, scriptExecuter: ScriptExecuter): void {
    const dataMap = entity.getResourceState().getDataMap();
    const hostPlayer = hostPlayerList.get(entity);

    //終了
    if (dataMap.getBoolean("isEndEdit")) {
        entity.setDead();
    }

    //生成
    var receiveData = NGTOBuilderUtil.getJsonData<ReceiveData>(dataMap, "sendData");
    if (receiveData) {
        const isInitializedBuild = dataMap.getBoolean("isInitializedBuild");

        //初回の呼び出しでbuilder(BlockBuilder)にデータを追加する
        if (!isInitializedBuild) {
            dataMap.setBoolean("isInitializedBuild", true, 1);

            //JSONからブロック設置位置のリストを受け取る
            const posList = receiveData;
            let blockSet = NGTOBuilderUtil.getHeldBlockSet(hostPlayer);
            if (!blockSet) blockSet = new BlockSet(Blocks.stone, 0);
            builder.addAll(entity, blockSet, posList as Pos[]);
        }

        //ブロックを設置 ※doBuildは1回の呼び出しで設置できるブロックの数に制限があるため、
        //完了するまで呼び出し続ける必要がある。完了しているかどうかはisFinishedで判定する
        builder.doBuild(entity);

        //生成完了の処理
        if (builder.isFinished(entity)) {
            //初回フラグをリセット
            dataMap.setBoolean("isInitializedBuild", false, 1);

            //処理が終わったことを返す
            dataMap.setBoolean("buildComplete", true, 1);

            //用が終わったのでデータを削除する
            NGTOBuilderUtil.resetJsonData(dataMap, "sendData");
        }
    }

    //Undo
    const isUndo = dataMap.getBoolean("isUndo");
    if (isUndo) {
        //最後に積んだundoデータ(BlockBuilder)を取得
        const lastUndoBuild = UndoManager.getLastData(entity);
        if (lastUndoBuild) {

            //Undoの生成を実行する ※undoBuildも1回の呼び出しで設置できるブロックの数に制限があるため、
            //完了するまで呼び出し続ける必要がある。完了しているかどうかはisFinishedで判定する
            lastUndoBuild.undoBuild(entity);

            //Undo終了
            if (lastUndoBuild.isFinished(entity)) {
                //最後のUndoデータを削除
                UndoManager.pop(entity);

                //処理が終わったのでフラグを戻す
                dataMap.setBoolean("isUndo", false, 1);
            }
        }
        else {
            //undoデータがないので終了する
            dataMap.setBoolean("isUndo", false, 1);
        }
    }
}

//#################################
//#################################
declare global {
    var isKaizPatch: boolean;
    var hostPlayerList: WeakHashMap;
    var Version: string;
}
isKaizPatch = RTMCore.VERSION.indexOf("KaizPatch") !== -1;
hostPlayerList = new WeakHashMap();
function onUpdate(entity: EntityVehicle, scriptExecuter: ScriptExecuter): void {
    entity.rotationYaw = 0;
    const dataMap = entity.getResourceState().getDataMap();
    const hostPlayer = hostPlayerList.get(entity);
    const rider = RTMApiCompat.getRider(entity) as EntityPlayer;
    const ridingEntity = RTMApiCompat.getRidingEntity(entity);
    if (dataMap.getString("VERSIONS") === "") dataMap.setString("VERSIONS", Version, 1);
    RTMApiCompat.doFollowing(entity, hostPlayer);//1.12用
    let playerEntityId = null;
    if (!hostPlayer) {//ホストプレイヤー未登録
        init(entity, scriptExecuter);
        if (rider) {
            hostPlayerList.put(entity, rider);
            playerEntityId = rider.getEntityId();
            dataMap.setString("hostPlayerEntityId", String(playerEntityId), 1);
            RTMApiCompat.dismountPlayer(entity);
            RTMApiCompat.startRiding(entity, rider);
        }
        else if (ridingEntity) {
            hostPlayerList.put(entity, ridingEntity);
            playerEntityId = ridingEntity.getEntityId();
            dataMap.setString("hostPlayerEntityId", String(playerEntityId), 1);
        }
    }
    else if (rider) {
        RTMApiCompat.dismountPlayer(entity);
        dataMap.setBoolean("isEndEdit", true, 1);
    }
    else {//ホストプレイヤー登録済み
        const isInitializedServer = dataMap.getBoolean("isInitializedServer");
        if (isInitializedServer) dataMap.setBoolean("isInitializedServer", false, 1);
        onUpdate2(entity, scriptExecuter);
    }
}