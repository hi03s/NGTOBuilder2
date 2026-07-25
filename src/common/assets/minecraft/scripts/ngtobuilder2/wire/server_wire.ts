import { RTMBlock, RTMItem } from "jp.ngt.rtm";
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
import { NGTLog } from "jp.ngt.ngtlib.io";
import { InsulatorPos } from "../../lib_hi03toolkit_1_0/lib_InsulatorCollector";
import { ItemStack } from "net.minecraft.item";
import { BlockSet } from "jp.ngt.ngtlib.block";
import { ItemInstalledObject, ItemWithModel } from "jp.ngt.rtm.item";
import { NBTTagCompound } from "net.minecraft.nbt";
import { TileEntityInsulator } from "jp.ngt.rtm.electric";
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
export type ReceiveData_wire = {
	posList: InsulatorPos[];
};

function onUpdate2(
	entity: EntityVehicle,
	scriptExecuter: ScriptExecuter,
): void {
	const dataMap = entity.getResourceState().getDataMap();
	const hostPlayer = hostPlayerList.get(entity);
	const world = RTMApiCompat.getWorld(entity);

	//終了
	if (dataMap.getBoolean("isEndEdit")) {
		entity.setDead();
	}

	//生成
	const receiveData = NGTOBuilderUtil.getJsonData<ReceiveData_wire>(
		dataMap,
		"sendData",
	);
	const cancelBuild = dataMap.getBoolean("cancelBuild");
	let heldItem: ItemStack | null = NGTOBuilderUtil.getHeldItem(hostPlayer);
	const insulatorItem = getItemInsulator(hostPlayer);
	if (heldItem && heldItem.getItem() !== RTMItem.itemWire) heldItem = null;
	if (receiveData) {
		const isInitializedBuild = dataMap.getBoolean("isInitializedBuild");
		if (!isInitializedBuild) {
			let modelName = "NoModel_Side";
			//if (insulatorItem) modelName = insulatorItem.getTagCompound().getString("ModelName");
			if (insulatorItem)
				modelName = RTMApiCompat.getModelNameFromItem(insulatorItem);
			const posList = receiveData.posList;
			for (let i = 0; i < posList.length; i++) {
				//コネクタ
				const pos = posList[i];
				const nbt = new NBTTagCompound();
				nbt.setString("ModelName", modelName);
				nbt.setFloat("offsetX", pos[4]);
				nbt.setFloat("offsetY", pos[5]);
				nbt.setFloat("offsetZ", pos[6]);
				const blockSet = new BlockSet(RTMBlock.insulator, pos[3], nbt);
				builder.add(entity, blockSet, pos[0], pos[1], pos[2]);
			}
			UndoManager.backupFromBlockBuilder(entity, builder);
			dataMap.setBoolean("canUndo", UndoManager.canUndo(entity), 1);
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
			//ワイヤーを生成する
			if (heldItem) {
				const placedPos = receiveData.posList.map(
					(pos) => [pos[0], pos[1], pos[2]] as Pos,
				);
				for (let i = 1; i < placedPos.length; i++) {
					const prevPos = placedPos[i - 1];
					const pos = placedPos[i];
					if (!prevPos || !pos) continue;
					if (
						prevPos[0] === pos[0] &&
						prevPos[1] === pos[1] &&
						prevPos[2] === pos[2]
					)
						continue;
					const tile = RTMApiCompat.getTileEntity(
						world,
						pos[0],
						pos[1],
						pos[2],
					);
					if (tile instanceof TileEntityInsulator) {
						RTMApiCompat.setWireConnection(tile, prevPos, heldItem);
					}
				}
			}

			//終了
			RTMApiCompat.sendChatMessage(hostPlayer, `[NGTO Builder2] 生成終了`);
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

function getItemInsulator(player: EntityPlayer): ItemStack | null {
	for (let i = 0; i <= 8; i++) {
		const itemStack = RTMApiCompat.getItemStackAt(player.inventory, i);
		if (
			itemStack &&
			itemStack.getItem() instanceof ItemInstalledObject &&
			RTMApiCompat.getSubType(itemStack) === "Relay"
		) {
			return itemStack;
		}
	}
	return null;
}
