import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapper, MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import {
	ModelSetConnector,
	ModelSetVehicle,
	ModelSetWire,
} from "jp.ngt.rtm.modelpack.modelset";
import { ModelObject, Parts, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { ICommandSender } from "net.minecraft.command";
import { EntityPlayer } from "net.minecraft.entity.player";
import { Keyboard, Mouse } from "org.lwjgl.input";
import {
	NGTOBuilderUtilClient,
	Pos,
} from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtilClient";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { GL11 } from "org.lwjgl.opengl";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { BezierCollector } from "../../lib_hi03toolkit_1_0/lib_BezierCollector";
import { BezierCurve3D } from "../../lib_hi03toolkit_1_0/lib_BezierCurve3D";
import { InputManager } from "../../lib_hi03toolkit_1_0/lib_InputManager";
import {
	InsulatorCollector,
	InsulatorPos,
} from "../../lib_hi03toolkit_1_0/lib_InsulatorCollector";
import { ItemInstalledObject } from "jp.ngt.rtm.item";
import { Item, ItemStack } from "net.minecraft.item";
import { RTMItem } from "jp.ngt.rtm";
import { RTMApiCompatClient } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompatClient";
import { HashMap } from "java.util";
import { Connection, TileEntityInsulator } from "jp.ngt.rtm.electric";
import { Vec3 } from "jp.ngt.ngtlib.math";
import { ReceiveData_catenary } from "./server_wire_catenary";
import { Entity } from "net.minecraft.entity";
import { DataMap } from "jp.ngt.rtm.modelpack.state";
declare const renderer: VehiclePartsRenderer;

//##  NGTO Builder2 Prop設置  ##

//initに設定するグローバル関数の宣言
function init(par1: ModelSetVehicle, par2: ModelObject): void {
	keyManager = new InputManager();

	//バージョン
	Version = "2.2";

	//###################
	//##  ユーザー設定  ##
	//###################

	//ーー共通ーー
	keyManager.setOptionKey(Keyboard.KEY_LCONTROL); //オプションキー
	keyManager.register("showHelp", Keyboard.KEY_H, false, `ヘルプを表示`);
	keyManager.register("endEdit", Keyboard.KEY_Q, false, `ツールを終了`);
	keyManager.register("build", Keyboard.KEY_RETURN, false, `生成する`);
	keyManager.register("cancelBuild", Keyboard.KEY_BACK, true, `生成を中止する`);
	keyManager.register("undo", Keyboard.KEY_Z, true, `Undo`);
	//ーーカーソル操作ーー
	keyManager.register(
		"resetSelected",
		Keyboard.KEY_C,
		false,
		`すべての選択をリセットする`,
	);
	keyManager.register(
		"insulatorHeightIncrease",
		Keyboard.KEY_UP,
		false,
		`選択予定/選択済みの碍子を一括で1ブロック上げる`,
	);
	keyManager.register(
		"insulatorHeightDecrease",
		Keyboard.KEY_DOWN,
		false,
		`選択予定/選択済みの碍子を一括で1ブロック下げる`,
	);
	//ーー機能ーー
	keyManager.register(
		"isDeviation",
		Keyboard.KEY_O,
		false,
		`架線偏位を切り替える`,
	);
	keyManager.register(
		"isDeviationInvert",
		Keyboard.KEY_O,
		true,
		`架線偏位の左右を入れ替える`,
	);
	keyManager.register(
		"isBeamWire",
		Keyboard.KEY_I,
		false,
		`ワイヤー式ビーム設置の切り替え`,
	);
	keyManager.register(
		"isBeamInsulatorMode",
		Keyboard.KEY_I,
		true,
		`ワイヤー式ビームの碍子の設置位置を切り替える`,
	);
	//ーー架線操作ーー
	keyManager.register(
		"laneLeft",
		Keyboard.KEY_LEFT,
		true,
		`左にレーンを増やす/右のレーンを減らす`,
	);
	keyManager.register(
		"laneRight",
		Keyboard.KEY_RIGHT,
		true,
		`右にレーンを増やす/左のレーンを減らす`,
	);
	keyManager.register(
		"laneDistanceIncrease",
		Keyboard.KEY_RIGHT,
		false,
		`レーン間の距離を増やす`,
	);
	keyManager.register(
		"laneDistanceDecrease",
		Keyboard.KEY_LEFT,
		false,
		`レーン間の距離を減らす`,
	);
	keyManager.register(
		"beamDistanceIncrease",
		Keyboard.KEY_UP,
		true,
		`ワイヤー式ビームの長さを0.1m増やす`,
	);
	keyManager.register(
		"beamDistanceDecrease",
		Keyboard.KEY_DOWN,
		true,
		`ワイヤー式ビームの長さを0.1m減らす`,
	);

	//-------------------
	//--  ユーザー設定  --
	//-------------------
	ignoreItemList = [RTMItem.itemWire, RTMItem.installedObject];
	//posCollector = new InsulatorCollector();
	bezierCollector = new BezierCollector();
	collectorListCache = new HashMap();
	beamCollectorCache = new HashMap();
	initParts();
}
var ignoreItemList: Item[];
let wireModelList: { [name: string]: ModelSetWire };
let connectorModelList: { [name: string]: ModelSetConnector };
var keyManager: InputManager;
var Version: string;
var bezierCollector: BezierCollector;
var collectorListCache: HashMap<Entity, InsulatorCollector[]>;
var beamCollectorCache: HashMap<Entity, InsulatorCollector>;

function keyInput(
	hostPlayer: EntityPlayer,
	entity: EntityVehicle,
	isRightClick: boolean,
	isLeftClick: boolean,
): void {
	const sender = hostPlayer as unknown as ICommandSender;
	const dataMap = entity.getResourceState().getDataMap();
	const lookingPos = NGTOBuilderUtilClient.getLookingPos();
	const world = RTMApiCompat.getWorld(entity);
	let collectorList = collectorListCache.get(entity);
	if (!collectorList) {
		collectorList = [];
		collectorList.push(new InsulatorCollector());
		collectorListCache.put(entity, collectorList);
	}
	let beamCollector = beamCollectorCache.get(entity);
	if (!beamCollector) {
		beamCollector = new InsulatorCollector();
		beamCollectorCache.put(entity, beamCollector);
	}

	if (keyManager.pressed("showHelp")) {
		NGTLog.sendChatMessage(sender, `---NGTO Builder2 架線設置 操作方法---`);
		//ーー共通ーー
		NGTLog.sendChatMessage(sender, keyManager.getDescription("endEdit"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("build"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("cancelBuild"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("undo"));
		//ーーカーソル操作ーー
		NGTLog.sendChatMessage(sender, `---カーソル操作---`);
		NGTLog.sendChatMessage(sender, `[右クリック] レール上の座標を選択`);
		NGTLog.sendChatMessage(
			sender,
			`[${Keyboard.getKeyName(keyManager.getOptionKeyCode())} + 右クリック] レール上の座標を選択(180度回転)`,
		);
		NGTLog.sendChatMessage(sender, `[左クリック] 最後の選択を解除`);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("resetSelected"));
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("insulatorHeightIncrease"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("insulatorHeightDecrease"),
		);
		//ーー機能ーー
		NGTLog.sendChatMessage(sender, `---機能---`);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("isDeviation"));
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("isDeviationInvert"),
		);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("isBeamWire"));
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("isBeamInsulatorMode"),
		);
		//ーー架線操作ーー
		NGTLog.sendChatMessage(sender, `---架線操作---`);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("laneLeft"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("laneRight"));
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("laneDistanceIncrease"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("laneDistanceDecrease"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("beamDistanceIncrease"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("beamDistanceDecrease"),
		);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] チャット欄を開き、上へスクロールするとすべての操作説明を確認できます。`,
		);
	}

	//終了
	if (keyManager.down("endEdit")) {
		dataMap.setBoolean("isEndEdit", true, 1);
	}

	//生成
	const insulatorItems = getItemInsulators(hostPlayer);
	if (insulatorItems.length === 1) insulatorItems.push(insulatorItems[0]); //1つしかない場合は両方に同じものを入れる
	const insulatorName1 =
		insulatorItems && insulatorItems.length > 0
			? RTMApiCompat.getModelNameFromItem(insulatorItems[0])
			: "NoModel_Side";
	const insulatorName2 =
		insulatorItems && insulatorItems.length > 1
			? RTMApiCompat.getModelNameFromItem(insulatorItems[1])
			: "NoModel_Side";
	const beamConnectorModelName =
		insulatorItems && insulatorItems.length > 0
			? RTMApiCompat.getModelNameFromItem(
					insulatorItems[insulatorItems.length - 1],
				)
			: "NoModel_Side";

	let laneCount = dataMap.getInt("laneCount");
	let laneDistance = dataMap.getDouble("laneDistance");
	let insulatorHeightOffset = dataMap.getInt("insulatorHeightOffset");
	const isBuilding = dataMap.getBoolean("isBuilding");
	const isUndo = dataMap.getBoolean("isUndo");
	const posList = collectorList[0].getAll(entity);
	let heldItem: ItemStack | null = NGTOBuilderUtil.getHeldItem(hostPlayer);
	if (heldItem && heldItem.getItem() !== RTMItem.itemWire) heldItem = null;
	if (
		keyManager.pressed("build") &&
		posList.length > 0 &&
		heldItem &&
		!isUndo &&
		!isBuilding
	) {
		dataMap.setBoolean("isBuilding", true, 1);
		const _posList: InsulatorPos[][] = [];
		const modelNameList: string[][] = [];
		for (let i = 0; i < collectorList.length; i++) {
			_posList.push(collectorList[i].getAll(entity));
			modelNameList.push([insulatorName1, insulatorName2]);
		}
		//送信
		const sendData: ReceiveData_catenary = {
			posList: _posList,
			modelNameList: modelNameList,
			beamPosList: beamCollector.getAll(entity),
			beamInsulatorName: beamConnectorModelName,
		};
		NGTOBuilderUtil.sendJsonData(dataMap, "sendData", sendData);
		NGTLog.sendChatMessage(sender, `[NGTO Builder2] 生成中...`);
	}

	//生成を中止する
	if (keyManager.pressed("cancelBuild") && isBuilding) {
		NGTLog.sendChatMessage(sender, `[NGTO Builder2] 生成を中止`);
		dataMap.setBoolean("cancelBuild", true, 1);
	}

	//Undo
	const canUndo = dataMap.getBoolean("canUndo");
	if (keyManager.pressed("undo") && canUndo && !isBuilding && !isUndo) {
		dataMap.setBoolean("isUndo", true, 1);
		NGTLog.sendChatMessage(sender, "[NGTO Builder2] Undo...");
	}

	//座標を追加
	if (
		lookingPos &&
		isRightClick &&
		(!heldItem ||
			(heldItem && ignoreItemList.indexOf(heldItem.getItem()) === -1))
	) {
		const lookingRailMap = NGTOBuilderUtil.getRailMapAt(
			entity,
			lookingPos.posX,
			lookingPos.posY,
			lookingPos.posZ,
		);
		if (lookingRailMap) {
			//架線偏位のオフセット 選択済み数によってLRが交互に入れ替わる
			const isDeviation = dataMap.getBoolean("isDeviation");
			const isDeviationInvert = dataMap.getBoolean("isDeviationInvert");
			const selectCount = collectorList[0].size(entity);
			const deviationOffset = isDeviation
				? 0.125 * ((selectCount % 2 === 0) !== isDeviationInvert ? -1 : 1)
				: 0;
			let deviationOffsetVec = new Vec3(deviationOffset, 0, 0);

			const split = Math.floor(lookingRailMap.getLength() * 2);
			const rmIndex = lookingRailMap.getNearlestPoint(
				split,
				lookingPos.posX,
				lookingPos.posZ,
			);
			const rmPosZX = lookingRailMap.getRailPos(split, rmIndex);
			const rmPosY = lookingRailMap.getRailHeight(split, rmIndex);
			const heightOffsetY = rmPosY - Math.floor(rmPosY) - 1 / 16; //勾配Y差分
			let rmYaw = RTMApiCompat.getRailYaw(lookingRailMap, split, rmIndex);
			if (keyManager.downOptionKey()) rmYaw += 180 + 360; //コントロールキーによる追加かチェックするため+360
			deviationOffsetVec = deviationOffsetVec.rotateAroundY(rmYaw);
			collectorList[0].add(
				entity,
				rmPosZX[1] + deviationOffsetVec.getX(),
				Math.floor(rmPosY) +
					5.5 +
					heightOffsetY +
					insulatorHeightOffset,
				rmPosZX[0] + deviationOffsetVec.getZ(),
				1,
				rmYaw,
			);

			const size = collectorList[0].size(entity);
			const list = collectorList[0].getAll(entity);
			if (size > 1) {
				const prev = list[size - 2];
				const last = list[size - 1];
				const sp: Pos = [
					prev[0] + 0.5 + prev[4],
					prev[1] + 0.5 + prev[5],
					prev[2] + 0.5 + prev[6],
				];
				const ep: Pos = [
					last[0] + 0.5 + last[4],
					last[1] + 0.5 + last[5],
					last[2] + 0.5 + last[6],
				];
				const cp = BezierCurve3D.lerpPoint(sp, ep, 0.5);
				bezierCollector.add(entity, new BezierCurve3D(sp, cp, ep));
			}

			//左右の並行レーンがあれば再構築する
			rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
		}
	}

	//選択を解除
	if (
		isLeftClick &&
		(!heldItem ||
			(heldItem && ignoreItemList.indexOf(heldItem.getItem()) === -1))
	) {
		collectorList[0].pop(entity);
		bezierCollector.pop(entity);

		//左右の並行レーンがあれば再構築する
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
	}

	//すべての選択をリセットする
	if (keyManager.pressed("resetSelected")) {
		collectorList[0].clear(entity);
		bezierCollector.clear(entity);
		dataMap.setInt("insulatorHeightOffset", 0, 0);

		//左右の並行レーンがあれば再構築する
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
	}

	//碍子の高さを1ブロック単位で調整する
	if (keyManager.pressed("insulatorHeightIncrease")) {
		insulatorHeightOffset += 1;
		dataMap.setInt("insulatorHeightOffset", insulatorHeightOffset, 0);
		collectorList[0].translateY(entity, 1);
		bezierCollector.translateY(entity, 1);
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
		NGTLog.sendChatMessage(
			sender,
			`碍子の高さ補正: ${formatBlockOffset(insulatorHeightOffset)}`,
		);
	}
	if (keyManager.pressed("insulatorHeightDecrease")) {
		insulatorHeightOffset -= 1;
		dataMap.setInt("insulatorHeightOffset", insulatorHeightOffset, 0);
		collectorList[0].translateY(entity, -1);
		bezierCollector.translateY(entity, -1);
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
		NGTLog.sendChatMessage(
			sender,
			`碍子の高さ補正: ${formatBlockOffset(insulatorHeightOffset)}`,
		);
	}

	//架線偏位を切り替える
	if (keyManager.pressed("isDeviation")) {
		const isDeviation = dataMap.getBoolean("isDeviation");
		dataMap.setBoolean("isDeviation", !isDeviation, 1);
		NGTLog.sendChatMessage(sender, `架線偏位: ${!isDeviation ? "ON" : "OFF"}`);
	}

	//架線偏位の左右を入れ替える
	if (keyManager.pressed("isDeviationInvert")) {
		const isDeviationInvert = dataMap.getBoolean("isDeviationInvert");
		dataMap.setBoolean("isDeviationInvert", !isDeviationInvert, 1);
		NGTLog.sendChatMessage(sender, `始点の架線偏位のLRを入れ替え`);
	}

	//ワイヤー式ビーム設置の切り替え
	if (keyManager.pressed("isBeamWire")) {
		const isBeamWire = dataMap.getBoolean("isBeamWire");
		dataMap.setBoolean("isBeamWire", !isBeamWire, 0);
		NGTLog.sendChatMessage(
			sender,
			`ワイヤー式ビーム設置: ${!isBeamWire ? "ON" : "OFF"}`,
		);

		//左右の並行レーンがあれば再構築する
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
	}

	//ワイヤー式ビームの碍子の設置位置を切り替える
	if (keyManager.pressed("isBeamInsulatorMode")) {
		const isBeamInsulatorMode = dataMap.getBoolean("isBeamInsulatorMode");
		dataMap.setBoolean("isBeamInsulatorMode", !isBeamInsulatorMode, 0);
		NGTLog.sendChatMessage(
			sender,
			`ワイヤー式ビームの碍子の設置位置: ${isBeamInsulatorMode ? `空中` : `地面`}`,
		);

		//左右の並行レーンがあれば再構築する
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
	}

	//左にレーンを増やす/右のレーンを減らす
	if (keyManager.pressed("laneLeft")) {
		laneCount = laneCount - 1;
		dataMap.setInt("laneCount", laneCount, 0);
		const laneDescription =
			laneCount > 0
				? `R+${laneCount}`
				: laneCount < 0
					? `L+${Math.abs(laneCount)}`
					: "0";
		NGTLog.sendChatMessage(sender, `レーン数: ${laneDescription}`);

		//左右の並行レーンがあれば再構築する
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
	}

	//右にレーンを増やす/左のレーンを減らす
	if (keyManager.pressed("laneRight")) {
		laneCount = laneCount + 1;
		dataMap.setInt("laneCount", laneCount, 0);
		const laneDescription =
			laneCount > 0
				? `R+${laneCount}`
				: laneCount < 0
					? `L+${Math.abs(laneCount)}`
					: "0";
		NGTLog.sendChatMessage(sender, `レーン数: ${laneDescription}`);

		//左右の並行レーンがあれば再構築する
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
	}

	//レーン間の距離を増やす
	if (laneDistance === 0) dataMap.setDouble("laneDistance", 4.0, 0);
	if (
		keyManager.pressed("laneDistanceIncrease") ||
		keyManager.held("laneDistanceIncrease", 500)
	) {
		laneDistance += 0.1;
		dataMap.setDouble("laneDistance", laneDistance, 0);
		NGTLog.sendChatMessage(
			sender,
			`レーン間の距離: ${laneDistance.toFixed(1)}m`,
		);

		//左右の並行レーンがあれば再構築する
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
	}

	//レーン間の距離を減らす
	if (
		keyManager.pressed("laneDistanceDecrease") ||
		keyManager.held("laneDistanceDecrease", 500)
	) {
		laneDistance = Math.max(0, laneDistance - 0.1);
		dataMap.setDouble("laneDistance", laneDistance, 0);
		NGTLog.sendChatMessage(
			sender,
			`レーン間の距離: ${laneDistance.toFixed(1)}m`,
		);

		//左右の並行レーンがあれば再構築する
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
	}

	//ワイヤー式ビームの長さを0.1m増やす
	const beamDistance = dataMap.getDouble("beamDistance");
	if (
		keyManager.pressed("beamDistanceIncrease") ||
		keyManager.held("beamDistanceIncrease", 500)
	) {
		dataMap.setDouble("beamDistance", beamDistance + 0.1, 0);

		//左右の並行レーンがあれば再構築する
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
	}

	//ワイヤー式ビームの長さを0.1m減らす
	if (
		keyManager.pressed("beamDistanceDecrease") ||
		keyManager.held("beamDistanceDecrease", 500)
	) {
		dataMap.setDouble("beamDistance", beamDistance - 0.1, 0);

		//左右の並行レーンがあれば再構築する
		rebuildParallelLane(entity, collectorList, beamCollector, dataMap);
	}
}

//#################
//##  パーツ登録  ##
//#################
//## グローバル変数として使うための準備 ##
let body: Parts;
let line: Parts;
let line_selected: Parts;
let point: Parts;
let point_block: Parts;
let selected: Parts;
let selected_block: Parts;
let selectedLineArrow: Parts;
let point_rail: Parts;
let distanceNum: Parts[];
let distance_M: Parts;
let pole: Parts;
let beam: Parts;
function initParts(): void {
	//## 描画パーツの設定 ##
	body = renderer.registerParts(new Parts("body"));
	point = renderer.registerParts(new Parts("point"));
	point_block = renderer.registerParts(new Parts("point_block"));
	point_rail = renderer.registerParts(new Parts("point_rail"));
	selected = renderer.registerParts(new Parts("selected"));
	selected_block = renderer.registerParts(new Parts("selected_block"));
	selectedLineArrow = renderer.registerParts(new Parts("selectedLineArrow"));
	line = renderer.registerParts(new Parts("line"));
	line_selected = renderer.registerParts(new Parts("line_selected"));
	distanceNum = [];
	distanceNum[0] = renderer.registerParts(new Parts("distance_0"));
	distanceNum[1] = renderer.registerParts(new Parts("distance_1"));
	distanceNum[2] = renderer.registerParts(new Parts("distance_2"));
	distanceNum[3] = renderer.registerParts(new Parts("distance_3"));
	distanceNum[4] = renderer.registerParts(new Parts("distance_4"));
	distanceNum[5] = renderer.registerParts(new Parts("distance_5"));
	distanceNum[6] = renderer.registerParts(new Parts("distance_6"));
	distanceNum[7] = renderer.registerParts(new Parts("distance_7"));
	distanceNum[8] = renderer.registerParts(new Parts("distance_8"));
	distanceNum[9] = renderer.registerParts(new Parts("distance_9"));
	distance_M = renderer.registerParts(new Parts("distance_M"));
	pole = renderer.registerParts(new Parts("pole"));
	beam = renderer.registerParts(new Parts("beam"));
}

//############
//##  描画  ##
//############
//使用中のプレイヤーだけに描画されます
function renderForToolUser(
	entity: EntityVehicle,
	pass: number,
	par3: number,
): void {
	const dataMap = entity.getResourceState().getDataMap();
	const lookingPos = NGTOBuilderUtilClient.getLookingPos();
	const posX = MCWrapper.getPosX(entity);
	const posY = MCWrapper.getPosY(entity);
	const posZ = MCWrapper.getPosZ(entity);
	const player = MCWrapperClient.getPlayer();
	const isBuilding = dataMap.getBoolean("isBuilding");
	const isUndo = dataMap.getBoolean("isUndo");
	const world = RTMApiCompat.getWorld(entity);
	connectorModelList = connectorModelList
		? connectorModelList
		: RTMApiCompatClient.getModelSetList("ModelConnector");
	wireModelList = wireModelList
		? wireModelList
		: RTMApiCompatClient.getModelSetList("ModelWire");

	const insulatorItems = getItemInsulators(player);
	if (insulatorItems.length === 1) insulatorItems.push(insulatorItems[0]); //1つしかない場合は両方に同じものを入れる
	const insulatorName1 =
		insulatorItems && insulatorItems.length > 0
			? RTMApiCompat.getModelNameFromItem(insulatorItems[0])
			: "NoModel_Side";
	const insulatorModelSet1 = connectorModelList[insulatorName1];
	const insulatorOffset1 = insulatorModelSet1
		? insulatorModelSet1.getConfig().wirePos
		: [0, 0, 0];
	const isFlipModel1 = insulatorName1.toLocaleLowerCase().indexOf("flip") >= 0;
	const insulatorName2 =
		insulatorItems && insulatorItems.length > 1
			? RTMApiCompat.getModelNameFromItem(insulatorItems[1])
			: null;
	const insulatorModelSet2 = insulatorName2
		? connectorModelList[insulatorName2]
		: null;
	const insulatorOffset2 = insulatorModelSet2
		? insulatorModelSet2.getConfig().wirePos
		: [0, 0, 0];
	const isFlipModel2 = insulatorName2
		? insulatorName2.toLocaleLowerCase().indexOf("flip") >= 0
		: false;

	const isDeviation = dataMap.getBoolean("isDeviation");
	const isDeviationInvert = dataMap.getBoolean("isDeviationInvert");
	const insulatorHeightOffset = dataMap.getInt("insulatorHeightOffset");

	let collectorList = collectorListCache.get(entity);
	if (!collectorList) {
		collectorList = [];
		collectorList.push(new InsulatorCollector());
		collectorListCache.put(entity, collectorList);
	}

	let beamCollectorList = beamCollectorCache.get(entity);
	if (!beamCollectorList) {
		beamCollectorList = new InsulatorCollector();
		beamCollectorCache.put(entity, beamCollectorList);
	}

	//本体
	body.render(renderer);

	//カーソル
	if (lookingPos) {
		const lookingRailMap = NGTOBuilderUtil.getRailMapAt(
			entity,
			lookingPos.posX,
			lookingPos.posY,
			lookingPos.posZ,
		);
		if (lookingRailMap) {
			//碍子のモデルとオフセットの決定 選択済み数によってLRが交互に入れ替わる
			const insulatorOffset = isDeviation
				? (collectorList[0].size(entity) % 2 === 0) !== isDeviationInvert
					? insulatorOffset1
					: insulatorOffset2
				: insulatorOffset1;

			const selectCount = collectorList[0].size(entity);
			const deviationOffset = isDeviation
				? 0.125 * ((selectCount % 2 === 0) !== isDeviationInvert ? -1 : 1)
				: 0;
			let deviationOffsetVec = new Vec3(deviationOffset, 0, 0);

			const split = Math.floor(lookingRailMap.getLength() * 2);
			const rmIndex = lookingRailMap.getNearlestPoint(
				split,
				lookingPos.posX,
				lookingPos.posZ,
			);
			const rmPosZX = lookingRailMap.getRailPos(split, rmIndex);
			const rmPosY = lookingRailMap.getRailHeight(split, rmIndex);
			let rmYaw = RTMApiCompat.getRailYaw(lookingRailMap, split, rmIndex);
			if (keyManager.downOptionKey()) rmYaw += 180;
			deviationOffsetVec = deviationOffsetVec.rotateAroundY(rmYaw);
			const heightOffsetY = rmPosY - Math.floor(rmPosY) - 1 / 16; //勾配Y差分
			const currentPos: Pos = [
				rmPosZX[1] + insulatorOffset[0] + deviationOffsetVec.getX(),
				Math.floor(rmPosY) +
					5.5 +
					heightOffsetY +
					insulatorHeightOffset +
					insulatorOffset[1],
				rmPosZX[0] + insulatorOffset[2] + deviationOffsetVec.getZ(),
			];

			//距離表示
			if (collectorList[0].size(entity) > 0) {
				const prevPos = collectorList[0].getLastPos(entity);
				if (prevPos) {
					const _prevPos: Pos = [
						prevPos[0] +
							0.5 +
							prevPos[4] +
							insulatorOffset[0] +
							deviationOffsetVec.getX(),
						prevPos[1] +
							0.5 +
							prevPos[5] +
							insulatorOffset[1] +
							deviationOffsetVec.getY(),
						prevPos[2] +
							0.5 +
							prevPos[6] +
							insulatorOffset[2] +
							deviationOffsetVec.getZ(),
					];
					const dx = currentPos[0] - _prevPos[0];
					const dy = currentPos[1] - _prevPos[1];
					const dz = currentPos[2] - _prevPos[2];
					const distance = Math.round(
						Math.sqrt(dx * dx + dy * dy + dz * dz),
					).toString();
					const toPlayerYaw =
						Math.atan2(posX - currentPos[0], posZ - currentPos[2]) *
							(180 / Math.PI) +
						180;
					GL11.glPushMatrix();
					GL11.glTranslatef(
						rmPosZX[1] + deviationOffsetVec.getX(),
						rmPosY +
							5.5 +
							heightOffsetY +
							insulatorHeightOffset,
						rmPosZX[0] + deviationOffsetVec.getZ(),
					);
					GL11.glTranslatef(-posX, -posY, -posZ);
					GL11.glRotatef(toPlayerYaw, 0, 1, 0);
					for (let i = 0; i < distance.length; i++) {
						const num = parseInt(distance.charAt(i));
						GL11.glPushMatrix();
						GL11.glTranslatef(-i, 0, 0);
						distanceNum[num].render(renderer);
						if (i === distance.length - 1) distance_M.render(renderer);
						GL11.glPopMatrix();
					}
					GL11.glPopMatrix();
				}
			}

			//レールカーソル
			GL11.glPushMatrix();
			GL11.glTranslatef(rmPosZX[1], rmPosY, rmPosZX[0]);
			GL11.glTranslatef(-posX, -posY, -posZ);
			GL11.glRotatef(rmYaw, 0, 1, 0);
			point_rail.render(renderer);
			GL11.glPopMatrix();

			//接続ポイント
			GL11.glPushMatrix();
			GL11.glTranslatef(
				rmPosZX[1] + deviationOffsetVec.getX(),
				Math.floor(rmPosY) +
					5.5 +
					heightOffsetY +
					insulatorHeightOffset,
				rmPosZX[0] + deviationOffsetVec.getZ(),
			);
			GL11.glTranslatef(-posX, -posY, -posZ);
			point.render(renderer);
			GL11.glPopMatrix();

			//碍子のブロック座標
			GL11.glPushMatrix();
			GL11.glTranslatef(
				Math.floor(rmPosZX[1] + deviationOffsetVec.getX()) + 0.5,
				Math.floor(
					rmPosY +
						5.5 +
						heightOffsetY +
						insulatorHeightOffset,
				) + 0.5,
				Math.floor(rmPosZX[0] + deviationOffsetVec.getZ()) + 0.5,
			);
			GL11.glTranslatef(-posX, -posY, -posZ);
			point_block.render(renderer);
			GL11.glPopMatrix();

			//前のポイントからのカテナリー描画
			if (collectorList[0].size(entity) > 0) {
				const prevPos = collectorList[0].getLastPos(entity);
				if (prevPos) {
					const _prevPos: Pos = [
						prevPos[0] +
							0.5 +
							prevPos[4] +
							insulatorOffset[0] +
							deviationOffsetVec.getX(),
						prevPos[1] +
							0.5 +
							prevPos[5] +
							insulatorOffset[1] +
							deviationOffsetVec.getY(),
						prevPos[2] +
							0.5 +
							prevPos[6] +
							insulatorOffset[2] +
							deviationOffsetVec.getZ(),
					];
					GL11.glPushMatrix();
					GL11.glTranslatef(-posX, -posY, -posZ);
					renderWire([_prevPos[0], _prevPos[1], _prevPos[2]], currentPos, line);
					GL11.glPopMatrix();
				}
			}
		}
	}

	//選択済み
	//コネクタ
	collectorList.forEach((collector, index) => {
		if (!collector) return;
		if (collector.size(entity) > 0) {
			const list = collector.getAll(entity);
			for (let i = 0; i < list.length; i++) {
				//碍子のモデルとオフセットの決定 選択済み数によってLRが交互に入れ替わる
				const insulatorModelSet = isDeviation
					? (i % 2 === 0) !== isDeviationInvert
						? insulatorModelSet1
						: insulatorModelSet2
					: insulatorModelSet1;
				const insulatorOffset = isDeviation
					? (i % 2 === 0) !== isDeviationInvert
						? insulatorOffset1
						: insulatorOffset2
					: insulatorOffset1;
				const isFlipModel = isDeviation
					? (i % 2 === 0) !== isDeviationInvert
						? isFlipModel1
						: isFlipModel2
					: isFlipModel1;

				const pos = list[i];
				const renderPos = [
					pos[0] + 0.5 + pos[4] + insulatorOffset[0],
					pos[1] + 0.5 + pos[5] + insulatorOffset[1],
					pos[2] + 0.5 + pos[6] + insulatorOffset[2],
				];
				//const tileEntity = world.getTileEntity(Math.floor(pos[0]), Math.floor(pos[1]), Math.floor(pos[2]));
				const tileEntity = RTMApiCompat.getTileEntity(
					world,
					Math.floor(pos[0]),
					Math.floor(pos[1]),
					Math.floor(pos[2]),
				);
				if (!(tileEntity instanceof TileEntityInsulator)) {
					//碍子のプレビュー
					GL11.glPushMatrix();
					GL11.glTranslatef(renderPos[0], renderPos[1], renderPos[2]);
					GL11.glTranslatef(-posX, -posY, -posZ);
					if (insulatorModelSet) {
						applyRotationSide(pos[3]);
						GL11.glRotatef(pos[7] - 540 + (isFlipModel ? 180 : 0), 0, 1, 0);
						NGTOBuilderUtilClient.enableAlpha(0.3);
						NGTOBuilderUtilClient.renderModel(
							renderer,
							pass,
							RTMApiCompatClient.getModelObject(insulatorModelSet),
						);
						NGTOBuilderUtilClient.disableAlpha();
					} else selected.render(renderer);
					GL11.glPopMatrix();

					//碍子のブロックのプレビュー
					GL11.glPushMatrix();
					GL11.glTranslatef(
						Math.floor(pos[0] + 0.5 + pos[4]) + 0.5,
						Math.floor(pos[1] + 0.5 + pos[5]) + 0.5,
						Math.floor(pos[2] + 0.5 + pos[6]) + 0.5,
					);
					GL11.glTranslatef(-posX, -posY, -posZ);
					selected_block.render(renderer);
					GL11.glPopMatrix();
				}

				//ワイヤーのプレビュー
				if (i > 0) {
					const prevPos = list[i - 1];
					const prevRenderPos = [
						prevPos[0] + 0.5 + prevPos[4] + insulatorOffset[0],
						prevPos[1] + 0.5 + prevPos[5] + insulatorOffset[1],
						prevPos[2] + 0.5 + prevPos[6] + insulatorOffset[2],
					];
					GL11.glPushMatrix();
					GL11.glTranslatef(-posX, -posY, -posZ);
					renderWire(
						[renderPos[0], renderPos[1], renderPos[2]],
						[prevRenderPos[0], prevRenderPos[1], prevRenderPos[2]],
						line_selected,
					);
					GL11.glPopMatrix();
				}
			}
		}
	});

	//ワイヤーの矢印
	if (bezierCollector.size(entity) > 0) {
		const bezierList = bezierCollector.getAll(entity);
		GL11.glPushMatrix();
		GL11.glTranslatef(-posX, -posY, -posZ);
		for (let i = 0; i < bezierList.length; i++) {
			const bezier = bezierList[i];
			NGTOBuilderUtilClient.renderBezierStatic(
				renderer,
				selectedLineArrow,
				bezier,
				10,
			);
		}
		GL11.glPopMatrix();
	}

	//ワイヤー式ビームのプレビュー
	if (beamCollectorList.size(entity) > 0) {
		const beamPosList = beamCollectorList.getAll(entity); //beamPosListの要素は[0]が始点、[1]が終点の繰り返し
		const renderOffsetY = dataMap.getBoolean("isBeamInsulatorMode") ? 0 : -5; //碍子を空中に置くか地面に置くか
		for (let i = 0; i < beamPosList.length; i = i + 2) {
			const startPos = beamPosList[i];
			const endPos = beamPosList[i + 1];

			const startX = startPos[0] + 0.5 + startPos[4];
			const startY = startPos[1] + 0.5 + startPos[5];
			const startZ = startPos[2] + 0.5 + startPos[6];
			const endX = endPos[0] + 0.5 + endPos[4];
			const endY = endPos[1] + 0.5 + endPos[5];
			const endZ = endPos[2] + 0.5 + endPos[6];

			GL11.glPushMatrix();
			GL11.glTranslatef(-posX, -posY, -posZ);
			renderWire(
				[startX, startY + (5.5 + renderOffsetY), startZ],
				[endX, endY + (5.5 + renderOffsetY), endZ],
				beam,
			);
			GL11.glPopMatrix();

			GL11.glPushMatrix();
			GL11.glTranslatef(startX, startY + renderOffsetY, startZ);
			GL11.glTranslatef(-posX, -posY, -posZ);
			pole.render(renderer);
			GL11.glPopMatrix();

			GL11.glPushMatrix();
			GL11.glTranslatef(endX, endY + renderOffsetY, endZ);
			GL11.glTranslatef(-posX, -posY, -posZ);
			pole.render(renderer);
			GL11.glPopMatrix();

			renderBlockPreview(startX, startY, startZ, posX, posY, posZ);
			renderBlockPreview(endX, endY, endZ, posX, posY, posZ);
		}
	}
}

//他のプレイヤーに描画する
function renderForOtherUser(
	entity: EntityVehicle,
	pass: number,
	par3: number,
): void {
	//本体
	body.render(renderer);
}

//本体の描画(モデル選択と画面併用)
function renderInMenu(): void {
	body.render(renderer);
}

//#################################
//#################################
function render(entity: EntityVehicle, pass: number, par3: number): void {
	if (!entity) {
		renderInMenu();
		return;
	}
	const dataMap = entity.getResourceState().getDataMap();
	const isOpenGUI = NGTUtilClient.getMinecraft().currentScreen !== null;
	const world = RTMApiCompat.getWorld(entity);
	const player = MCWrapperClient.getPlayer();
	const hostPlayerEntityId = dataMap.getString("hostPlayerEntityId");
	let hostPlayer = null;
	if (hostPlayerEntityId !== "") hostPlayer = world.getEntityByID(Number(hostPlayerEntityId)) as unknown as EntityPlayer;
	const prevIsLeftClick = dataMap.getBoolean("prevIsLeftClick");
	const prevIsRightClick = dataMap.getBoolean("prevIsRightClick");
	if (hostPlayer === null) {
		dataMap.setBoolean("showHelpMessage", false, 0);
		if (!prevIsLeftClick) dataMap.setBoolean("prevIsLeftClick", true, 0);
		if (!prevIsRightClick) dataMap.setBoolean("prevIsRightClick", true, 0);
		renderForOtherUser(entity, pass, par3);
		return;
	}
	const sender = hostPlayer as unknown as ICommandSender;
	const isLeftClick = Mouse.isButtonDown(0);
	const isRightClick = Mouse.isButtonDown(1);
	const VERSIONS_server = dataMap.getString("VERSIONS");
	const isVersionChecked = dataMap.getBoolean("isVersionChecked");
	RTMApiCompat.doFollowing(entity, hostPlayer); //1.12用
	if (hostPlayer && hostPlayer === player) {
		if (isLeftClick !== prevIsLeftClick) dataMap.setBoolean("prevIsLeftClick", isLeftClick, 0);
		if (isRightClick !== prevIsRightClick) dataMap.setBoolean("prevIsRightClick", isRightClick, 0);
		if (renderer.currentMatId === 0 && pass === 0) keyManager.update();
		if (VERSIONS_server !== "" && VERSIONS_server != Version && !isVersionChecked) {
			dataMap.setBoolean("isVersionChecked", true, 0);
			NGTLog.sendChatMessage(sender, `§cVersions don't match!`);
			NGTLog.sendChatMessage(sender, `§cClient: ${Version}`);
			NGTLog.sendChatMessage(sender, `§cServer: ${VERSIONS_server}`);
		}
		const showHelpMessage = dataMap.getBoolean("showHelpMessage");
		if (!showHelpMessage) {
			dataMap.setBoolean("showHelpMessage", true, 0);
			NGTLog.sendChatMessage(sender, keyManager.getDescription("showHelp"));
		}
		if (!isOpenGUI && pass === 0 && renderer.currentMatId === 0) keyInput(hostPlayer, entity, !prevIsRightClick && isRightClick, !prevIsLeftClick && isLeftClick);
		renderForToolUser(entity, pass, par3);
	}
}

//追加関数
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

function formatBlockOffset(offset: number): string {
	return `${offset > 0 ? "+" : ""}${offset}ブロック`;
}

function applyRotationSide(blockSide: number): void {
	switch (blockSide) {
		case 0: //下
			GL11.glRotatef(180, 0, 0, 1);
			break;
		case 1: //上
			break;
		case 2: //北
			GL11.glRotatef(-90, 1, 0, 0);
			break;
		case 3: //南
			GL11.glRotatef(90, 1, 0, 0);
			break;
		case 4: //西
			GL11.glRotatef(90, 0, 0, 1);
			break;
		case 5: //東
			GL11.glRotatef(-90, 0, 0, 1);
			break;
	}
}

function renderWire(pos1: Pos, pos2: Pos, parts: Parts): void {
	const vec = new Vec3(pos2[0] - pos1[0], pos2[1] - pos1[1], pos2[2] - pos1[2]);
	const scale = vec.length();
	const yaw = vec.getYaw();
	const pitch = vec.getPitch();
	GL11.glPushMatrix();
	GL11.glTranslatef(pos1[0], pos1[1], pos1[2]);
	GL11.glRotatef(yaw, 0, 1, 0);
	GL11.glRotatef(-pitch, 1, 0, 0);
	GL11.glScalef(1, 1, scale);
	parts.render(renderer);
	GL11.glPopMatrix();
}

function rebuildParallelLane(
	entity: EntityVehicle,
	collectorList: InsulatorCollector[],
	beamCollector: InsulatorCollector,
	dataMap: DataMap,
): void {
	const laneCount = dataMap.getInt("laneCount"); //左のときはマイナスの値を取る
	const laneDistance = dataMap.getDouble("laneDistance");
	const beamDistance = dataMap.getDouble("beamDistance");
	const isBeamWire = dataMap.getBoolean("isBeamWire");
	const isBeamInsulatorMode = dataMap.getBoolean("isBeamInsulatorMode");

	//架線の追加
	const targetLaneCount = Math.abs(laneCount);
	for (let lane = 1; lane < collectorList.length; lane++) {
		if (collectorList[lane]) {
			collectorList[lane].clear(entity);
		}
	}
	collectorList.length = targetLaneCount + 1;
	const baseList = collectorList[0].getAll(entity);
	for (let lane = 1; lane <= targetLaneCount; lane++) {
		if (!collectorList[lane]) collectorList[lane] = new InsulatorCollector();
		const collector = collectorList[lane];
		collector.clear(entity);
		for (let i = 0; i < baseList.length; i++) {
			const pos = baseList[i];
			const yaw = pos[7];
			const deviation = laneDistance * lane * (laneCount > 0 ? -1 : 1);
			let deviationVec = new Vec3(deviation, 0, 0);
			deviationVec = deviationVec.rotateAroundY(yaw);
			collector.add(
				entity,
				pos[0] + 0.5 + pos[4] + deviationVec.getX(),
				pos[1] + 0.5 + pos[5],
				pos[2] + 0.5 + pos[6] + deviationVec.getZ(),
				pos[3],
				pos[7],
			);
		}
	}
	collectorListCache.put(entity, collectorList);

	//ビームの追加
	beamCollector.clear(entity);
	if (isBeamWire) {
		const beamMargin = beamDistance + 3;
		const outerLaneDeviation =
			laneDistance * Math.abs(laneCount) * (laneCount > 0 ? -1 : 1);
		const beamLeft = Math.min(0, outerLaneDeviation) - beamMargin;
		const beamRight = Math.max(0, outerLaneDeviation) + beamMargin;
		for (let i = 0; i < baseList.length; i++) {
			const pos = baseList[i];
			const yaw = pos[7];
			let deviationVecLeft = new Vec3(beamLeft, 0, 0);
			let deviationVecRight = new Vec3(beamRight, 0, 0);
			deviationVecLeft = deviationVecLeft.rotateAroundY(yaw);
			deviationVecRight = deviationVecRight.rotateAroundY(yaw);
			const baseX = pos[0] + 0.5 + pos[4];
			const baseY = pos[1] + 0.5 + pos[5];
			const baseZ = pos[2] + 0.5 + pos[6];
			const groundY = pos[1] - 4.5;
			const insulatorY = !isBeamInsulatorMode ? baseY : groundY;
			beamCollector.add(
				entity,
				baseX + deviationVecLeft.getX(),
				insulatorY,
				baseZ + deviationVecLeft.getZ(),
				pos[3],
				pos[7],
			);
			beamCollector.add(
				entity,
				baseX + deviationVecRight.getX(),
				insulatorY,
				baseZ + deviationVecRight.getZ(),
				pos[3],
				pos[7],
			);
		}
	}
}

function renderBlockPreview(
	x: number,
	y: number,
	z: number,
	entityX: number,
	entityY: number,
	entityZ: number,
): void {
	GL11.glPushMatrix();
	GL11.glTranslatef(
		Math.floor(x) + 0.5,
		Math.floor(y) + 0.5,
		Math.floor(z) + 0.5,
	);
	GL11.glTranslatef(-entityX, -entityY, -entityZ);
	selected_block.render(renderer);
	GL11.glPopMatrix();
}
