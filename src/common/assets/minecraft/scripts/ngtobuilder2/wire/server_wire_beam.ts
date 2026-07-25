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
import { ItemInstalledObject } from "jp.ngt.rtm.item";
import { NBTTagCompound } from "net.minecraft.nbt";
import { TileEntityInsulator } from "jp.ngt.rtm.electric";
import { Entity } from "net.minecraft.entity";

//##  NGTO Builder2 ワイヤー式ビーム専用設置ツール  ##

Version = "1.0";

let blockLimit: number;

function init(entity: EntityVehicle, scriptExecuter: ScriptExecuter): void {
	const dataMap = entity.getResourceState().getDataMap();
	const isInitializedServer = dataMap.getBoolean("isInitializedServer");
	if (isInitializedServer) return;

	dataMap.setBoolean("isInitializedServer", true, 1);

	blockLimit = 500;

	dataMap.setBoolean("buildComplete", false, 1);
	dataMap.setBoolean("isInitializedBuild", false, 1);
}

export type ReceiveData_beam = {
	beamPosList: InsulatorPos[];
	beamInsulatorName: string;
};

function onUpdate2(
	entity: EntityVehicle,
	scriptExecuter: ScriptExecuter,
): void {
	const dataMap = entity.getResourceState().getDataMap();
	const hostPlayer = hostPlayerList.get(entity);
	const world = RTMApiCompat.getWorld(entity);

	let builder: BlockBuilder = builderHashMap.get(entity);
	if (!builder) {
		builder = new BlockBuilder();
		builderHashMap.put(entity, builder);
	}

	//終了
	if (dataMap.getBoolean("isEndEdit")) {
		entity.setDead();
	}

	//生成
	const receiveData = NGTOBuilderUtil.getJsonData<ReceiveData_beam>(
		dataMap,
		"sendData",
	);
	const cancelBuild = dataMap.getBoolean("cancelBuild");

	if (receiveData) {
		const isInitializedBuild = dataMap.getBoolean("isInitializedBuild");

		if (!isInitializedBuild) {
			builder.clear(entity);

			const beamPosList = receiveData.beamPosList;

			for (let i = 0; i < beamPosList.length; i++) {
				const pos = beamPosList[i];

				const nbt = new NBTTagCompound();
				nbt.setString("ModelName", receiveData.beamInsulatorName);
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

			dataMap.setBoolean("isInitializedBuild", false, 1);
			dataMap.setBoolean("isBuilding", false, 1);
			dataMap.setBoolean("cancelBuild", false, 1);
			NGTOBuilderUtil.resetJsonData(dataMap, "sendData");
			return;
		}

		//生成
		builder.doBuild(entity, blockLimit);

		//生成完了
		if (builder.isFinished(entity)) {
			const beamWire = getBeamWire(hostPlayer);

			if (beamWire) {
				const beamPosList = receiveData.beamPosList.map(
					(pos) => [pos[0], pos[1], pos[2]] as Pos,
				);

				// beamPosListの要素は[0]が始点、[1]が終点の繰り返し
				for (let i = 0; i < beamPosList.length; i = i + 2) {
					const startPos = beamPosList[i];
					const endPos = beamPosList[i + 1];

					if (!startPos || !endPos) continue;

					const tile = RTMApiCompat.getTileEntity(
						world,
						endPos[0],
						endPos[1],
						endPos[2],
					);
					if (tile instanceof TileEntityInsulator) {
						RTMApiCompat.setWireConnection(tile, startPos, beamWire);
					}
				}
			}

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

	let playerEntityId = null;

	if (!hostPlayer) {
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
		const isInitializedServer = dataMap.getBoolean("isInitializedServer");
		if (isInitializedServer)
			dataMap.setBoolean("isInitializedServer", false, 1);
		onUpdate2(entity, scriptExecuter);
	}
}

function getItemInsulators(player: EntityPlayer): ItemStack[] {
	const list: ItemStack[] = [];

	for (let i = 0; i <= 8; i++) {
		const itemStack = RTMApiCompat.getItemStackAt(player.inventory, i);

		if (
			itemStack &&
			itemStack.getItem() instanceof ItemInstalledObject &&
			RTMApiCompat.getSubType(itemStack) === "Relay"
		) {
			list.push(itemStack);
		}
	}

	return list;
}

function getBeamWire(player: EntityPlayer): ItemStack | null {
	const itemStack = NGTOBuilderUtil.getHeldItem(player);
	return itemStack && itemStack.getItem() === RTMItem.itemWire
		? itemStack
		: null;
}
