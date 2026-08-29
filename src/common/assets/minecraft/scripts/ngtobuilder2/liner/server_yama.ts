import { BlockSet } from "jp.ngt.ngtlib.block";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ScriptExecuter } from "jp.ngt.rtm.modelpack";
import { WeakHashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { EntityPlayer } from "net.minecraft.entity.player";
import { BlockBuilder } from "../../lib_hi03toolkit_1_0/lib_BlockBuilder";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { UndoManager } from "../../lib_hi03toolkit_1_0/lib_UndoManager";
import {
	generateMountainBlocks,
	MountainBlock,
	RidgeNode,
} from "./mountain_generator";

Version = "2.2";
blockLimit = 500;
ridgeLengthLimit = 256;
ridgeWidthLimit = 128;
ridgeHeightLimit = 128;
totalBlockLimit = 300000;

let builder: BlockBuilder;
var blockLimit: number;
var ridgeLengthLimit: number;
var ridgeWidthLimit: number;
var ridgeHeightLimit: number;
var totalBlockLimit: number;

export type ReceiveData_yama = {
	a: RidgeNode;
	b: RidgeNode;
	baseY: number;
};

function init(entity: EntityVehicle, scriptExecuter: ScriptExecuter): void {
	const dataMap = entity.getResourceState().getDataMap();
	if (dataMap.getBoolean("isInitializedServer")) return;
	dataMap.setBoolean("isInitializedServer", true, 1);
	builder = builderHashMap.get(entity);
	if (!builder) {
		builder = new BlockBuilder();
		builderHashMap.put(entity, builder);
	} else builder.clear(entity);
	dataMap.setBoolean("buildComplete", false, 1);
	dataMap.setBoolean("isInitializedBuild", false, 1);
}

function getBlockSet(block: MountainBlock): BlockSet {
	if (block[3] === "grass")
		return new BlockSet(RTMApiCompat.getBlockGrass(), 0);
	if (block[3] === "dirt")
		return new BlockSet(RTMApiCompat.getBlockDirt(), 0);
	return new BlockSet(RTMApiCompat.getBlockStone(), 0);
}

function onUpdate2(
	entity: EntityVehicle,
	scriptExecuter: ScriptExecuter,
): void {
	const dataMap = entity.getResourceState().getDataMap();
	const hostPlayer = hostPlayerList.get(entity);
	if (dataMap.getBoolean("isEndEdit")) entity.setDead();

	const receiveData = NGTOBuilderUtil.getJsonData<ReceiveData_yama>(
		dataMap,
		"sendData",
	);
	const cancelBuild = dataMap.getBoolean("cancelBuild");
	if (receiveData) {
		const isInitializedBuild = dataMap.getBoolean("isInitializedBuild");
		if (!isInitializedBuild) {
			const dx = receiveData.b.x - receiveData.a.x;
			const dz = receiveData.b.z - receiveData.a.z;
			const ridgeLength = Math.sqrt(dx * dx + dz * dz);
			const maxWidth = Math.max(receiveData.a.width, receiveData.b.width);
			const maxHeight = Math.max(
				receiveData.a.height,
				receiveData.b.height,
			);
			if (ridgeLength > ridgeLengthLimit) {
				RTMApiCompat.sendChatMessage(
					hostPlayer,
					`[NGTO Builder2] 尾根の長さが上限を超えています (${Math.floor(ridgeLength)} / ${ridgeLengthLimit}[m])`,
				);
			} else if (maxWidth > ridgeWidthLimit) {
				RTMApiCompat.sendChatMessage(
					hostPlayer,
					`[NGTO Builder2] 山幅が上限を超えています (${maxWidth} / ${ridgeWidthLimit}[m])`,
				);
			} else if (maxHeight > ridgeHeightLimit) {
				RTMApiCompat.sendChatMessage(
					hostPlayer,
					`[NGTO Builder2] 尾根の高さが上限を超えています (${maxHeight} / ${ridgeHeightLimit}[m])`,
				);
			} else {
				const blocks = generateMountainBlocks(
					receiveData.a,
					receiveData.b,
					receiveData.baseY,
					totalBlockLimit,
				);
				if (blocks.length > totalBlockLimit) {
					RTMApiCompat.sendChatMessage(
						hostPlayer,
						`[NGTO Builder2] ブロック数が上限を超えています (${blocks.length} / ${totalBlockLimit}[blocks])`,
					);
				} else {
					for (let i = 0; i < blocks.length; i++) {
						const block = blocks[i];
						builder.add(
							entity,
							getBlockSet(block),
							block[0],
							block[1],
							block[2],
						);
					}
					UndoManager.backupFromBlockBuilder(entity, builder);
					dataMap.setBoolean(
						"canUndo",
						UndoManager.canUndo(entity),
						1,
					);
				}
			}
			dataMap.setBoolean("isInitializedBuild", true, 1);
		}
		if (cancelBuild) {
			const remainingCount = builder.getCount(entity);
			UndoManager.removeUnbuiltBlocks(entity, remainingCount);
			builder.clear(entity);
		}
		builder.doBuild(entity, blockLimit);
		if (builder.isFinished(entity)) {
			RTMApiCompat.sendChatMessage(
				hostPlayer,
				"[NGTO Builder2] 生成終了",
			);
			builder.clear(entity);
			dataMap.setBoolean("isInitializedBuild", false, 1);
			dataMap.setBoolean("isBuilding", false, 1);
			dataMap.setBoolean("cancelBuild", false, 1);
			NGTOBuilderUtil.resetJsonData(dataMap, "sendData");
		}
	}

	if (dataMap.getBoolean("isUndo")) {
		const lastUndoBuild = UndoManager.getLastData(entity);
		if (lastUndoBuild) {
			lastUndoBuild.doBuild(entity, blockLimit);
			if (lastUndoBuild.isFinished(entity)) {
				UndoManager.pop(entity);
				dataMap.setBoolean("isUndo", false, 1);
				dataMap.setBoolean("canUndo", UndoManager.canUndo(entity), 1);
			}
		} else dataMap.setBoolean("isUndo", false, 1);
	}
}

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
	RTMApiCompat.doFollowing(entity, hostPlayer);
	if (!hostPlayer) {
		init(entity, scriptExecuter);
		if (rider) {
			hostPlayerList.put(entity, rider);
			dataMap.setString(
				"hostPlayerEntityId",
				String(rider.getEntityId()),
				1,
			);
			RTMApiCompat.dismountPlayer(entity);
			RTMApiCompat.startRiding(entity, rider);
		} else if (ridingEntity instanceof EntityPlayer) {
			hostPlayerList.put(entity, ridingEntity);
			dataMap.setString(
				"hostPlayerEntityId",
				String(ridingEntity.getEntityId()),
				1,
			);
		}
	} else if (rider) {
		RTMApiCompat.dismountPlayer(entity);
		dataMap.setBoolean("isEndEdit", true, 1);
	} else {
		if (dataMap.getBoolean("isInitializedServer"))
			dataMap.setBoolean("isInitializedServer", false, 1);
		onUpdate2(entity, scriptExecuter);
	}
}
