import { RTMItem } from "jp.ngt.rtm";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ScriptExecuter } from "jp.ngt.rtm.modelpack";
import { WeakHashMap } from "java.util";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { BlockBuilder } from "../../lib_hi03toolkit_1_0/lib_BlockBuilder";
import { EntityPlayer } from "net.minecraft.entity.player";
import { UndoManager } from "../../lib_hi03toolkit_1_0/lib_UndoManager";
import { NGTLog } from "jp.ngt.ngtlib.io";
import { ItemStack } from "net.minecraft.item";
import { ItemInstalledObject } from "jp.ngt.rtm.item";
import { Entity } from "net.minecraft.entity";
import {
	BezierControlPoints,
	BezierCurve3D,
} from "../../lib_hi03toolkit_1_0/lib_BezierCurve3D";
import { RotatableBlockObjectFactory } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectFactory";
import { RotatableBlockObject } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObject";
import {
	BlockDiffusionMode,
	RotatableBlockObjectMapper,
} from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectMapper";

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
let blockLimit: number;
function init(entity: EntityVehicle, scriptExecuter: ScriptExecuter): void {
	const dataMap = entity.getResourceState().getDataMap();
	const isInitializedServer = dataMap.getBoolean("isInitializedServer");
	if (isInitializedServer) return;
	dataMap.setBoolean("isInitializedServer", true, 1);

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
export type ReceiveData_measure = {
	bezierList: BezierControlPoints[];
};

function onUpdate2(
	entity: EntityVehicle,
	scriptExecuter: ScriptExecuter,
): void {
	const dataMap = entity.getResourceState().getDataMap();
	const hostPlayer = hostPlayerList.get(entity);
	const world = RTMApiCompat.getWorld(entity);

	//マーカー固定
	const isMarkerFix = dataMap.getBoolean("isMarkerFix");
	if (isMarkerFix) {
		dataMap.setBoolean("isMarkerFix", false, 1);

		//プレイヤーから降りる
		RTMApiCompat.dismount(entity);
		hostPlayerList.remove(entity);
		dataMap.setBoolean("isReset", false, 1);

		//最後の座標があればそこにテレポート
		const posListData = dataMap.getString("selectedPosList");
		const posList: number[][] = posListData
			? JSON.parse(posListData.replace(/☆/g, ","))
			: [];
		if (posList.length > 0) {
			const lastPos = posList[posList.length - 1];
			entity.setPosition(lastPos[0] + 0.5, lastPos[1] + 1, lastPos[2] + 0.5);
		}
	}

	//ブロック生成用のBlockBuilder
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
	const receiveData = NGTOBuilderUtil.getJsonData<ReceiveData_measure>(
		dataMap,
		"sendData",
	);
	const heldBlockSet = NGTOBuilderUtil.getHeldBlockSet(hostPlayer);
	const cancelBuild = dataMap.getBoolean("cancelBuild");
	if (receiveData) {
		const isInitializedBuild = dataMap.getBoolean("isInitializedBuild");
		if (!isInitializedBuild && heldBlockSet) {
			//ベジェ曲線を構築する
			const bezierList: BezierCurve3D[] = [];
			for (let i = 0; i < receiveData.bezierList.length; i++) {
				const bezier = receiveData.bezierList[i];
				bezierList.push(new BezierCurve3D(...bezier));
			}
			//RBO生成
			const baseRbo = RotatableBlockObjectFactory.createBox(
				heldBlockSet,
				1,
				1,
				1,
			);
			//ベジェ曲線上に展開してRBOを合成する
			const margedRBO = new RotatableBlockObject();
			const origin = bezierList[0].getPoint(1, 0);
			for (let bezierIdx = 0; bezierIdx < bezierList.length; bezierIdx++) {
				const bezier = bezierList[bezierIdx];
				const split = Math.max(1, Math.floor(bezier.getLength() * 2));
				for (let idx = 0; idx <= split; idx++) {
					const rbo = baseRbo.copy();
					const pos = bezier.getPoint(split, idx);
					rbo.offset(
						Math.floor(pos[0]) - Math.floor(origin[0]),
						Math.floor(pos[1]) - Math.floor(origin[1]),
						Math.floor(pos[2]) - Math.floor(origin[2]),
					);
					margedRBO.merge(rbo);
				}
			}
			RotatableBlockObjectMapper.applyDiffusionSelf(
				margedRBO,
				BlockDiffusionMode.get(BlockDiffusionMode.XYZ),
			);
			RotatableBlockObjectMapper.toBlockCoordSelf(margedRBO);
			const placementBlocks = RotatableBlockObjectMapper.toBlockPlacements(
				margedRBO,
				origin[0],
				origin[1],
				origin[2],
			);
			builder.addFromRotatableBlockObjectAt(entity, placementBlocks);
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
	for (let i = 8; i >= 0; i--) {
		const itemStack = RTMApiCompat.getItemStackAt(player.inventory, i);
		if (itemStack && itemStack.getItem() === RTMItem.itemWire) {
			return itemStack;
		}
	}
	return null;
}
