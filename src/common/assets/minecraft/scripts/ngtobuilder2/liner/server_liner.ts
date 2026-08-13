import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ScriptExecuter } from "jp.ngt.rtm.modelpack";
import { WeakHashMap } from "java.util";
import {
	NGTOBuilderUtil,
	Pos,
} from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import {
	BlockBuilder,
	BlockSetPlacement,
} from "../../lib_hi03toolkit_1_0/lib_BlockBuilder";
import { EntityPlayer } from "net.minecraft.entity.player";
import { UndoManager } from "../../lib_hi03toolkit_1_0/lib_UndoManager";
import { NGTLog } from "jp.ngt.ngtlib.io";
import {
	BezierControlPoints,
	BezierCurve3D,
} from "../../lib_hi03toolkit_1_0/lib_BezierCurve3D";
import { RotatableBlockObject } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObject";
import {
	BlockDiffusionMode,
	RotatableBlockObjectMapper,
} from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectMapper";
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
Version = "2.1";

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
export type ReceiveData_liner = {
	bezierList: BezierControlPoints[];
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
	const receiveData = NGTOBuilderUtil.getJsonData<ReceiveData_liner>(
		dataMap,
		"sendData",
	);
	const heldNGTO = NGTOBuilderUtil.getHeldNGTO(hostPlayer);
	const cancelBuild = dataMap.getBoolean("cancelBuild");
	if (receiveData) {
		const isInitializedBuild = dataMap.getBoolean("isInitializedBuild");
		if (!isInitializedBuild && heldNGTO) {
			const interpolationMode = dataMap.getInt("interpolationMode");
			const diffusionRate = dataMap.getInt("diffusionRate");
			const isMirrorX = dataMap.getBoolean("isMirrorX");
			const isMirrorY = dataMap.getBoolean("isMirrorY");
			const isMirrorZ = dataMap.getBoolean("isMirrorZ");
			const offsetNGTOV = dataMap.getInt("offsetNGTOV"); //垂直方向
			const offsetNGTOH = dataMap.getInt("offsetNGTOH"); //水平方向
			const ngtoRotate = dataMap.getInt("ngtoRotate"); //0:+Z, 1:+X, 2:-Z, 3:-X
			const isMasking = dataMap.getBoolean("isMasking");
			const isPlaceAirBlock = dataMap.getBoolean("isPlaceAirBlock");
			let ngto = heldNGTO;
			//NGTOの変更を適用する
			if (
				ngtoRotate !== 0 ||
				isMirrorX ||
				isMirrorZ ||
				isMirrorY ||
				offsetNGTOV !== 0 ||
				offsetNGTOH !== 0
			) {
				const centerX = Math.floor(heldNGTO.xSize / 2) + 0.5;
				const centerZ = Math.floor(heldNGTO.zSize / 2) + 0.5;
				const transformedObj = RotatableBlockObject.createFromNGTO(
					heldNGTO,
					isPlaceAirBlock,
				);
				if (isMirrorX) transformedObj.mirrorX();
				if (isMirrorZ) transformedObj.mirrorZ();
				if (isMirrorY) transformedObj.mirrorY();
				transformedObj.setPivot(centerX, 0.5, centerZ);
				transformedObj.rotate(ngtoRotate * 90, 0, 0);
				transformedObj.movePivotToBase();
				ngto =
					NGTOBuilderUtil.createNGTOWithRotatableBlockObject(transformedObj);
			}
			//ベジェ曲線を構築する
			const bezierList: BezierCurve3D[] = [];
			for (let i = 0; i < receiveData.bezierList.length; i++) {
				const bezier = receiveData.bezierList[i];
				bezierList.push(new BezierCurve3D(...bezier));
			}
			//NGTOをスライスしたRotatableBlockObject[]をベジェ曲線上に展開する(繰り返し展開/2indexで1ブロック)
			const slicedRBO = NGTOBuilderUtil.sliceByZ(ngto, isPlaceAirBlock);
			const margedRBO = new RotatableBlockObject();
			//ベジェ曲線ごとにRBOを作って合成する
			const origin = bezierList[0].getPoint(1, 0);
			for (let bezierIdx = 0; bezierIdx < bezierList.length; bezierIdx++) {
				const bezier = bezierList[bezierIdx];
				const split = Math.max(1, Math.floor(bezier.getLength() * 2));
				for (let idx = 0; idx <= split; idx++) {
					const sliceIndex = Math.floor(idx / 2) % slicedRBO.length;
					const baseRbo = slicedRBO[sliceIndex];
					if (!baseRbo) continue;
					const rbo = baseRbo.copy();
					const pos = bezier.getPoint(split, idx);
					const yaw = bezier.getYaw(split, idx);
					const pitch = bezier.getPitch(split, idx);
					const centerX = Math.floor(ngto.xSize / 2) + 0.5;
					rbo.setPivot(centerX, 0.5, 0.5);
					rbo.offsetExpanding(offsetNGTOH, 0, 0);
					rbo.rotate(-yaw, -pitch, 0);
					rbo.movePivotToBase();
					rbo.offset(
						Math.floor(pos[0]) - Math.floor(origin[0]),
						Math.floor(pos[1]) - Math.floor(origin[1]) + offsetNGTOV,
						Math.floor(pos[2]) - Math.floor(origin[2]),
					);
					margedRBO.merge(rbo);
				}
			}
			RotatableBlockObjectMapper.applyDiffusionSelf(
				margedRBO,
				BlockDiffusionMode.get(interpolationMode).withRate(diffusionRate / 100),
			);
			RotatableBlockObjectMapper.toBlockCoordSelf(margedRBO);
			let placementBlocks: BlockSetPlacement[] = [];
			if (isMasking)
				placementBlocks = RotatableBlockObjectMapper.toReplacePlacements(
					world,
					margedRBO,
					origin[0],
					origin[1],
					origin[2],
				);
			else
				placementBlocks = RotatableBlockObjectMapper.toBlockPlacements(
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
