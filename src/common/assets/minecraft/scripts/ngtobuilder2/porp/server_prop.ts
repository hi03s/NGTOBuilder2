import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ScriptExecuter } from "jp.ngt.rtm.modelpack";
import { WeakHashMap } from "java.util";
import {
	NGTOBuilderUtil,
	Pos,
} from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { BlockBuilder } from "../../lib_hi03toolkit_1_0/lib_BlockBuilder";
import { EntityPlayer } from "net.minecraft.entity.player";
import { UndoManager } from "../../lib_hi03toolkit_1_0/lib_UndoManager";
import { Quaternion } from "../../lib_hi03toolkit_1_0/lib_Quaternion";
import { NGTLog } from "jp.ngt.ngtlib.io";
import {
	BlockDiffusionMode,
	RotatableBlockObjectMapper,
} from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectMapper";
import { RotatableBlockObject } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObject";
import { RotatableBlockObjectFactory } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectFactory";
import { BlockSet } from "jp.ngt.ngtlib.block";
import { Blocks } from "net.minecraft.init";
import { Entity } from "net.minecraft.entity";

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

//## グローバル変数として使うための準備 ##
let builder: BlockBuilder;
let blockLimit: number;
function init(entity: EntityVehicle, scriptExecuter: ScriptExecuter): void {
	const dataMap = entity.getResourceState().getDataMap();
	const isInitializedServer = dataMap.getBoolean("isInitializedServer");
	if (isInitializedServer) return;
	dataMap.setBoolean("isInitializedServer", true, 1);

	//ブロック生成用のBlockBuilder
	builder = builderHashMap.get(entity);
	if (!builder) {
		builder = new BlockBuilder();
		builderHashMap.put(entity, builder);
	} else builder.clear(entity);

	//1tickに生成するブロック数
	blockLimit = 500; //blocks/tick (10000 blocks/sec)

	//dataMapのリセット
	dataMap.setBoolean("buildComplete", false, 1);
	dataMap.setBoolean("isInitializedBuild", false, 1);
}

//############
//##  処理  ##
//############
//JSON(sendData)から送られてくるデータの型
export type ReceiveData_prop = {
	q: [w: number, x: number, y: number, z: number];
	pos: Pos;
};

function onUpdate2(
	entity: EntityVehicle,
	scriptExecuter: ScriptExecuter,
): void {
	const dataMap = entity.getResourceState().getDataMap();
	const hostPlayer = hostPlayerList.get(entity);

	//終了
	if (dataMap.getBoolean("isEndEdit")) {
		entity.setDead();
	}

	//生成
	const receiveData = NGTOBuilderUtil.getJsonData<ReceiveData_prop>(
		dataMap,
		"sendData",
	);
	const ngto = NGTOBuilderUtil.getHeldNGTO(hostPlayer);
	const cancelBuild = dataMap.getBoolean("cancelBuild");
	if (receiveData) {
		const isInitializedBuild = dataMap.getBoolean("isInitializedBuild");
		if (!isInitializedBuild && ngto) {
			const isHuge = ngto.xSize * ngto.ySize * ngto.zSize > 20000;
			if (isHuge)
				RTMApiCompat.sendChatMessage(hostPlayer, "[NGTO Builder2] 計算中...");
			const q = new Quaternion(...receiveData.q);
			const interpolationMode = dataMap.getInt("interpolationMode");
			const isPlaceAirBlock = dataMap.getBoolean("isPlaceAirBlock");
			const diffusionRate = dataMap.getInt("diffusionRate");
			const isMirrorX = dataMap.getBoolean("isMirrorX");
			const isMirrorY = dataMap.getBoolean("isMirrorY");
			const isMirrorZ = dataMap.getBoolean("isMirrorZ");
			const offsetY = dataMap.getInt("offsetY");
			const isBuildSupportBlocks = dataMap.getBoolean("isBuildSupportBlocks");
			const supportY = dataMap.getInt("supportY");
			let supportRBO = new RotatableBlockObject();
			if (isBuildSupportBlocks && offsetY - 1 + supportY >= 2) {
				supportRBO = RotatableBlockObjectFactory.createBox(
					new BlockSet(RTMApiCompat.getBlockStone(), 0),
					ngto.xSize,
					offsetY - 1 + supportY,
					ngto.zSize,
				);
				supportRBO.offset(0, -offsetY + 1 - supportY, 0);
			}
			const centerX = Math.floor(ngto.xSize / 2) + 0.5;
			const centerZ = Math.floor(ngto.zSize / 2) + 0.5;
			const diffusion = BlockDiffusionMode.get(interpolationMode).withRate(
				diffusionRate / 100,
			);
			const blockObj = RotatableBlockObject.createFromNGTO(
				ngto,
				isPlaceAirBlock,
			);
			blockObj.mergeBefore(supportRBO);
			if (isMirrorX) blockObj.mirrorX();
			if (isMirrorZ) blockObj.mirrorZ();
			if (isMirrorY) blockObj.mirrorY();
			blockObj.setPivot(centerX, 0.5, centerZ);
			blockObj.rotateQ(q);
			blockObj.movePivotToBaseXZ();
			if (!q.isRightAngleRotation())
				RotatableBlockObjectMapper.applyDiffusionSelf(blockObj, diffusion);
			RotatableBlockObjectMapper.toBlockCoordSelf(blockObj);
			const placementBlocks = RotatableBlockObjectMapper.toBlockPlacements(
				blockObj,
				receiveData.pos[0],
				receiveData.pos[1],
				receiveData.pos[2],
			);
			builder.addFromRotatableBlockObjectAt(entity, placementBlocks);
			UndoManager.backupFromBlockBuilder(entity, builder);
			dataMap.setBoolean("canUndo", UndoManager.canUndo(entity), 1);
			if (isHuge)
				RTMApiCompat.sendChatMessage(hostPlayer, "[NGTO Builder2] 生成開始...");
			dataMap.setBoolean("isInitializedBuild", true, 1);
		}
		//生成を中止
		if (cancelBuild) {
			const remainingCount = builder.getCount(entity);
			UndoManager.removeUnbuiltBlocks(entity, remainingCount);
			builder.clear(entity);
		}
		//生成
		builder.doBuild(entity, blockLimit);
		//生成完了の処理
		if (builder.isFinished(entity)) {
			RTMApiCompat.sendChatMessage(hostPlayer, "[NGTO Builder2] 生成終了");
			builder.clear(entity);
			dataMap.setBoolean("isInitializedBuild", false, 1);
			dataMap.setBoolean("isBuilding", false, 1);
			dataMap.setBoolean("cancelBuild", false, 1);
			NGTOBuilderUtil.resetJsonData(dataMap, "sendData");
		}
	}

	//Undo
	const isUndo = dataMap.getBoolean("isUndo");
	if (isUndo) {
		const lastUndoBuild = UndoManager.getLastData(entity);
		if (lastUndoBuild) {
			lastUndoBuild.doBuild(entity, blockLimit);
			//Undo終了
			if (lastUndoBuild.isFinished(entity)) {
				UndoManager.pop(entity);
				dataMap.setBoolean("isUndo", false, 1);
				dataMap.setBoolean("canUndo", UndoManager.canUndo(entity), 1);
			}
		} else {
			dataMap.setBoolean("isUndo", false, 1);
		}
	}
}

//#################################
//#################################
var hostPlayerList: WeakHashMap<Entity, EntityPlayer>;
var builderHashMap: WeakHashMap<Entity, BlockBuilder>;
var Version: string;
hostPlayerList = new WeakHashMap();
builderHashMap = new WeakHashMap();
function onUpdate(entity: EntityVehicle, scriptExecuter: ScriptExecuter): void {
	entity.rotationYaw = 0;
	const dataMap = entity.getResourceState().getDataMap();
	const hostPlayer = hostPlayerList.get(entity);
	const rider = RTMApiCompat.getRider(entity) as unknown as EntityPlayer;
	const ridingEntity = RTMApiCompat.getRidingEntity(entity);
	if (dataMap.getString("VERSIONS") === "")
		dataMap.setString("VERSIONS", Version, 1);
	RTMApiCompat.doFollowing(entity, hostPlayer); //1.12用
	let playerEntityId = null;
	if (!hostPlayer) {
		//ホストプレイヤー未登録
		init(entity, scriptExecuter);
		if (rider) {
			hostPlayerList.put(entity, rider);
			playerEntityId = rider.getEntityId();
			dataMap.setString("hostPlayerEntityId", String(playerEntityId), 1);
			RTMApiCompat.dismountPlayer(entity);
			RTMApiCompat.startRiding(entity, rider);
		} else if (ridingEntity instanceof EntityPlayer) {
			hostPlayerList.put(entity, ridingEntity);
			playerEntityId = ridingEntity.getEntityId();
			dataMap.setString("hostPlayerEntityId", String(playerEntityId), 1);
		}
	} else if (rider) {
		RTMApiCompat.dismountPlayer(entity);
		dataMap.setBoolean("isEndEdit", true, 1);
	} else {
		//ホストプレイヤー登録済み
		const isInitializedServer = dataMap.getBoolean("isInitializedServer");
		if (isInitializedServer)
			dataMap.setBoolean("isInitializedServer", false, 1);
		onUpdate2(entity, scriptExecuter);
	}
}
