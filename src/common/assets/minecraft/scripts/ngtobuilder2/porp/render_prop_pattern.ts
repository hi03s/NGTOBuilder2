import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapper, MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { RTMCore } from "jp.ngt.rtm";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ModelSetVehicle } from "jp.ngt.rtm.modelpack.modelset";
import { ModelObject, Parts, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { ICommandSender } from "net.minecraft.command";
import { EntityPlayer } from "net.minecraft.entity.player";
import { Keyboard, Mouse } from "org.lwjgl.input";
import {
	NGTOBuilderUtilClient,
	Pos,
} from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtilClient";
import { PositionCollector } from "../../lib_hi03toolkit_1_0/lib_PositionCollector";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { RTMApiCompatClient } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompatClient";
import { GL11 } from "org.lwjgl.opengl";
import { HashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { Quaternion } from "../../lib_hi03toolkit_1_0/lib_Quaternion";
import { Vec3 } from "jp.ngt.ngtlib.math";
import {
	combineNGTOList,
	NGTOBuilderUtil,
} from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { BlockSet, NGTObject } from "jp.ngt.ngtlib.block";
import { Blocks } from "net.minecraft.init";
import { RotatableBlockObject } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObject";
import {
	BlockDiffusionMode,
	RotatableBlockObjectMapper,
} from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectMapper";
import { InputManager } from "../../lib_hi03toolkit_1_0/lib_InputManager";
import { ReceiveData_prop_pattern } from "./server_prop_pattern";
import { RotatableBlockObjectFactory } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectFactory";
declare const renderer: VehiclePartsRenderer;

//##  NGTO Builder2 Prop設置  ##

//initに設定するグローバル関数の宣言
function init(par1: ModelSetVehicle, par2: ModelObject): void {
	keyManager = new InputManager();

	//バージョン
	Version = "1.0";
	// v1.0 初回リリース

	//###################
	//##  ユーザー設定  ##
	//###################

	//スナップ角度リスト
	snapAngleList = [5, 15, 45, 90, 1];

	//ーー共通ーー
	keyManager.setOptionKey(Keyboard.KEY_LCONTROL); //オプションキー
	keyManager.register("showHelp", Keyboard.KEY_H, false, `ヘルプを表示`);
	keyManager.register("endEdit", Keyboard.KEY_Q, false, `ツールを終了`);
	keyManager.register("build", Keyboard.KEY_RETURN, false, `生成する`);
	keyManager.register("cancelBuild", Keyboard.KEY_BACK, true, `生成を中止する`);
	keyManager.register("undo", Keyboard.KEY_Z, true, `Undo`);
	//ーー機能ーー
	keyManager.register(
		"isBuildSupportBlocks",
		Keyboard.KEY_U,
		false,
		`足場の設置を切り替え`,
	);
	keyManager.register(
		"isPlaceAirBlock",
		Keyboard.KEY_I,
		false,
		`空気ブロックの設置を切り替え`,
	);
	keyManager.register(
		"isWorldAxis",
		Keyboard.KEY_O,
		false,
		`回転軸の基準を切り替え`,
	);
	keyManager.register(
		"changeSnapNext",
		Keyboard.KEY_P,
		false,
		`スナップ角度を変更(next)`,
	);
	keyManager.register(
		"changeSnapPrev",
		Keyboard.KEY_P,
		true,
		`スナップ角度を変更(prev)`,
	);
	keyManager.register(
		"setRandomAngle",
		Keyboard.KEY_R,
		false,
		`Yaw角度をランダムにセット`,
	);
	keyManager.register(
		"setToPlayerAngle",
		Keyboard.KEY_F,
		false,
		`角度をプレイヤーの方向にセット`,
	);
	keyManager.register("mirrorX", Keyboard.KEY_J, false, `X軸の鏡像の切り替え`);
	keyManager.register("mirrorY", Keyboard.KEY_K, false, `Y軸の鏡像の切り替え`);
	keyManager.register("mirrorZ", Keyboard.KEY_L, false, `Z軸の鏡像の切り替え`);
	keyManager.register(
		"supportYUp",
		Keyboard.KEY_UP,
		true,
		`足場ブロックの高さを上げる`,
	);
	keyManager.register(
		"supportYDown",
		Keyboard.KEY_DOWN,
		true,
		`足場ブロックの高さを下げる`,
	);
	//ーー俯瞰モードーー
	keyManager.register(
		"posYUp",
		Keyboard.KEY_UP,
		false,
		`カーソルの高さを上げる`,
	);
	keyManager.register(
		"posYDown",
		Keyboard.KEY_DOWN,
		false,
		`カーソルの高さを下げる`,
	);
	keyManager.register("resetPos", Keyboard.KEY_C, false, `状態をリセットする`);
	keyManager.register("rotationL", Keyboard.KEY_LEFT, false, `左回転`);
	keyManager.register("rotationR", Keyboard.KEY_RIGHT, false, `右回転`);
	//ーー仮置きモードーー
	keyManager.register(
		"rotationYawL",
		Keyboard.KEY_LEFT,
		false,
		`Yaw回転(Left)`,
	);
	keyManager.register(
		"rotationYawR",
		Keyboard.KEY_RIGHT,
		false,
		`Yaw回転(Right)`,
	);
	keyManager.register(
		"rotationPitchUp",
		Keyboard.KEY_UP,
		false,
		`Pitch回転(Up)`,
	);
	keyManager.register(
		"rotationPitchDown",
		Keyboard.KEY_DOWN,
		false,
		`Pitch回転(Down)`,
	);
	keyManager.register(
		"rotationRollL",
		Keyboard.KEY_LEFT,
		true,
		`Roll回転(Left)`,
	);
	keyManager.register(
		"rotationRollR",
		Keyboard.KEY_RIGHT,
		true,
		`Roll回転(Right)`,
	);
	keyManager.register("resetRotation", Keyboard.KEY_C, true, `回転をリセット`);

	//-------------------
	//--  ユーザー設定  --
	//-------------------

	collector = new PositionCollector();
	quaternionManager = new HashMap();
	posListCache = new HashMap();
	prevNGTOData = new HashMap();
	initParts();
}
var keyManager: InputManager;
var snapAngleList: number[];
var Version: string;
var collector: PositionCollector;
var quaternionManager: HashMap<Entity, Quaternion>;
var posListCache: HashMap<string, Pos[]>;
var prevNGTOData: HashMap<Entity, NGTObject | null>;

function keyInput(
	hostPlayer: EntityPlayer,
	entity: EntityVehicle,
	isRightClick: boolean,
	isLeftClick: boolean,
): void {
	const sender = hostPlayer as unknown as ICommandSender;
	const dataMap = entity.getResourceState().getDataMap();
	const lookingPos = NGTOBuilderUtilClient.getLookingPos();
	const offsetY = dataMap.getInt("offsetY");
	const supportY = dataMap.getInt("supportY");
	let isWorldAxis = dataMap.getBoolean("isWorldAxis");
	let quaternion = quaternionManager.get(entity);
	if (!quaternion) {
		quaternion = new Quaternion();
		quaternionManager.put(entity, quaternion);
	}
	let snapAngle = dataMap.getInt("snapAngle");
	if (snapAngle === 0) {
		snapAngle = snapAngleList[0];
		dataMap.setInt("snapAngle", snapAngle, 0);
	}
	let diffusionRate = dataMap.getInt("diffusionRate");
	if (diffusionRate === 0) {
		diffusionRate = 20;
		dataMap.setInt("diffusionRate", diffusionRate, 1);
	}
	const currentSnapIdx = snapAngleList.indexOf(snapAngle);
	const maxSnapIdx = snapAngleList.length;

	//ヘルプ表示
	if (keyManager.pressed("showHelp")) {
		NGTLog.sendChatMessage(
			sender,
			`---NGTO Builder2 プロップ配列設置 操作方法---`,
		);
		//ーー共通ーー
		NGTLog.sendChatMessage(sender, keyManager.getDescription("endEdit"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("build"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("cancelBuild"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("undo"));
		//ーー機能ーー
		NGTLog.sendChatMessage(sender, `---機能---`);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("isBuildSupportBlocks"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("isPlaceAirBlock"),
		);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("isWorldAxis"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("changeSnapNext"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("changeSnapPrev"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("setRandomAngle"));
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("setToPlayerAngle"),
		);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("mirrorX"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("mirrorY"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("mirrorZ"));
		NGTLog.sendChatMessage(
			sender,
			`[${Keyboard.getKeyName(keyManager.getOptionKeyCode())} + ホイールクリック] 補間モード切り替え`,
		);
		NGTLog.sendChatMessage(
			sender,
			`[${Keyboard.getKeyName(keyManager.getOptionKeyCode())} + マウスホイール上] 補間の拡散量を増やす`,
		);
		NGTLog.sendChatMessage(
			sender,
			`[${Keyboard.getKeyName(keyManager.getOptionKeyCode())} + マウスホイール下] 補間の拡散量を減らす`,
		);
		//ーー俯瞰モードーー
		NGTLog.sendChatMessage(sender, `---俯瞰モード---`);
		NGTLog.sendChatMessage(sender, `[右クリック] 仮置きする`);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("posYUp"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("posYDown"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("supportYUp"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("supportYDown"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("resetPos"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("rotationL"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("rotationR"));
		//ーー仮置きモードーー
		NGTLog.sendChatMessage(sender, `---仮置きモード---`);
		NGTLog.sendChatMessage(sender, `[左クリック] 仮置きを解除`);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("rotationYawL"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("rotationYawR"));
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("rotationPitchUp"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("rotationPitchDown"),
		);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("rotationRollL"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("rotationRollR"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("resetRotation"));
	}

	//ツールを終了
	if (keyManager.down("endEdit")) {
		dataMap.setBoolean("isEndEdit", true, 1);
	}

	//NGTOを生成する
	const isBuilding = dataMap.getBoolean("isBuilding");
	const isUndo = dataMap.getBoolean("isUndo");
	let buildPos: Pos | null = null;
	if (collector.size(entity) > 0) buildPos = collector.getAll(entity)[0] as Pos;
	else if (lookingPos)
		buildPos = [
			lookingPos.blockX,
			lookingPos.blockY + offsetY,
			lookingPos.blockZ,
		] as Pos;
	if (
		keyManager.pressed("build") &&
		buildPos?.length === 3 &&
		!isBuilding &&
		!isUndo
	) {
		dataMap.setBoolean("isBuilding", true, 1);
		const sendData: ReceiveData_prop_pattern = {
			q: [quaternion.w, quaternion.x, quaternion.y, quaternion.z],
			pos: buildPos,
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

	//足場ブロック設置を切り替え
	if (keyManager.pressed("isBuildSupportBlocks")) {
		let isBuildSupportBlocks = dataMap.getBoolean("isBuildSupportBlocks");
		isBuildSupportBlocks = !isBuildSupportBlocks;
		dataMap.setBoolean("isBuildSupportBlocks", isBuildSupportBlocks, 1);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 足場ブロック設置: ${isBuildSupportBlocks}`,
		);
	}

	//空気ブロックの設置を切り替え
	if (keyManager.pressed("isPlaceAirBlock")) {
		let isPlaceAirBlock = dataMap.getBoolean("isPlaceAirBlock");
		isPlaceAirBlock = !isPlaceAirBlock;
		dataMap.setBoolean("isPlaceAirBlock", isPlaceAirBlock, 1);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 空気ブロック設置: ${isPlaceAirBlock}`,
		);
	}

	//回転モードを切り替え
	if (keyManager.pressed("isWorldAxis")) {
		isWorldAxis = !isWorldAxis;
		dataMap.setBoolean("isWorldAxis", isWorldAxis, 0);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 回転軸: ${isWorldAxis ? "ワールド軸" : "ローカル軸"}`,
		);
	}

	//スナップ角度を変更(次)
	if (keyManager.pressed("changeSnapNext")) {
		const nextIdx = (currentSnapIdx + 1) % maxSnapIdx;
		snapAngle = snapAngleList[nextIdx];
		dataMap.setInt("snapAngle", snapAngle, 0);
		//現在の角度を変換
		quaternion = Quaternion.snapRollDelta(quaternion, snapAngle, true); //Rollスナップ
		quaternion = Quaternion.snapPitchDelta(quaternion, snapAngle, true); //Pitchスナップ
		quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true); //Yawスナップ
		//保存
		quaternionManager.put(entity, quaternion.normalizeSelf());
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] スナップ角度: ${snapAngle}`,
		);
	}

	//スナップ角度を変更(前)
	if (keyManager.pressed("changeSnapPrev")) {
		const prevIdx = (currentSnapIdx - 1 + maxSnapIdx) % maxSnapIdx;
		snapAngle = snapAngleList[prevIdx];
		dataMap.setInt("snapAngle", snapAngle, 0);
		//現在の角度を変換
		quaternion = Quaternion.snapRollDelta(quaternion, snapAngle, true); //Rollスナップ
		quaternion = Quaternion.snapPitchDelta(quaternion, snapAngle, true); //Pitchスナップ
		quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true); //Yawスナップ
		//保存
		quaternionManager.put(entity, quaternion.normalizeSelf());
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] スナップ角度: ${snapAngle}`,
		);
	}

	//Yaw角度をランダムにセット
	if (keyManager.pressed("setRandomAngle")) {
		const randomAngle = Math.random() * 360;
		const newQuaternion = Quaternion.fromEuler(randomAngle, 0, 0);
		quaternion = newQuaternion.multiply(quaternion); //ワールド上のYaw回転
		quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true); //Y軸スナップ
		quaternionManager.put(entity, quaternion.normalizeSelf()); //保存
	}

	//角度をプレイヤーの方向にセット
	if (keyManager.pressed("setToPlayerAngle")) {
		const currentQYaw = quaternion.extractYaw();
		if (collector.size(entity) > 0) {
			//すでに座標指定済み
			const pos = collector.getAll(entity)[0];
			const playerVec = new Vec3(
				entity.posX - pos[0] - 0.5,
				0,
				entity.posZ - pos[2] - 0.5,
			);
			const newQuaternion = Quaternion.fromEuler(
				playerVec.getYaw() - currentQYaw,
				0,
				0,
			);
			quaternion = newQuaternion.multiply(quaternion); //ワールド上のYaw回転
			quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true); //Y軸スナップ
			//保存
			quaternionManager.put(entity, quaternion.normalizeSelf());
		} else if (lookingPos) {
			const playerVec = new Vec3(
				entity.posX - lookingPos.posX,
				0,
				entity.posZ - lookingPos.posZ,
			);
			const newQuaternion = Quaternion.fromEuler(
				playerVec.getYaw() - currentQYaw,
				0,
				0,
			);
			quaternion = newQuaternion.multiply(quaternion); //ワールド上のYaw回転
			quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true); //Y軸スナップ
			//保存
			quaternionManager.put(entity, quaternion.normalizeSelf());
		}
	}

	//X鏡像
	if (keyManager.pressed("mirrorX")) {
		let isMirrorX = dataMap.getBoolean("isMirrorX");
		isMirrorX = !isMirrorX;
		dataMap.setBoolean("isMirrorX", isMirrorX, 1);
		NGTLog.sendChatMessage(sender, `[NGTO Builder2] X鏡像: ${isMirrorX}`);
	}

	//Y鏡像
	if (keyManager.pressed("mirrorY")) {
		let isMirrorY = dataMap.getBoolean("isMirrorY");
		isMirrorY = !isMirrorY;
		dataMap.setBoolean("isMirrorY", isMirrorY, 1);
		NGTLog.sendChatMessage(sender, `[NGTO Builder2] Y鏡像: ${isMirrorY}`);
	}

	//Z鏡像
	if (keyManager.pressed("mirrorZ")) {
		let isMirrorZ = dataMap.getBoolean("isMirrorZ");
		isMirrorZ = !isMirrorZ;
		dataMap.setBoolean("isMirrorZ", isMirrorZ, 1);
		NGTLog.sendChatMessage(sender, `[NGTO Builder2] Z鏡像: ${isMirrorZ}`);
	}

	//補間モード切り替え
	const isMiddleClick = Mouse.isButtonDown(2);
	const prevMiddleClick = dataMap.getBoolean("prevMiddleClick");
	if (isMiddleClick !== prevMiddleClick)
		dataMap.setBoolean("prevMiddleClick", isMiddleClick, 0);
	if (keyManager.downOptionKey() && isMiddleClick && !prevMiddleClick) {
		const interpolationMode = dataMap.getInt("interpolationMode");
		const nextModeId = BlockDiffusionMode.next(interpolationMode);
		dataMap.setInt("interpolationMode", nextModeId, 1);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 補間モード: ${BlockDiffusionMode.get(nextModeId).displayName}`,
		);
	}

	//補間の拡散量を変更
	const mouseWheel = Mouse.getDWheel();
	if (keyManager.downOptionKey()) {
		if (mouseWheel > 0) {
			diffusionRate = diffusionRate + 5;
			dataMap.setInt("diffusionRate", diffusionRate, 1);
			NGTLog.sendChatMessage(
				sender,
				`[NGTO Builder2] 補間の拡散量: ${diffusionRate / 100}[m]`,
			);
		} else if (mouseWheel < 0) {
			diffusionRate = diffusionRate - 5;
			dataMap.setInt("diffusionRate", diffusionRate, 1);
			NGTLog.sendChatMessage(
				sender,
				`[NGTO Builder2] 補間の拡散量: ${diffusionRate / 100}[m]`,
			);
		}
	}

	//足場ブロックの高さを上げる
	if (keyManager.pressed("supportYUp") && supportY > 0) {
		dataMap.setInt("supportY", supportY - 1, 1);
	}

	//足場ブロックの高さを下げる
	if (keyManager.pressed("supportYDown")) {
		dataMap.setInt("supportY", supportY + 1, 1);
	}

	//ーー俯瞰モードーー
	//仮置きする
	if (lookingPos && isRightClick && collector.size(entity) === 0) {
		dataMap.setBoolean("isFirstSelect", true, 0); //ミニチュアブロックGUIをrenderでブロックする
		collector.clear(entity);
		collector.add(
			entity,
			lookingPos.blockX,
			lookingPos.blockY + offsetY,
			lookingPos.blockZ,
			true,
		);
	}

	if (collector.size(entity) === 0) {
		//選択高さを増やす
		if (keyManager.pressed("posYUp")) {
			dataMap.setInt("offsetY", offsetY + 1, 1);
		}

		//選択高さを減らす
		if (keyManager.pressed("posYDown")) {
			dataMap.setInt("offsetY", offsetY - 1, 1);
		}

		//Y高さ/回転/鏡像をリセット
		if (keyManager.pressed("resetPos")) {
			dataMap.setInt("offsetY", 0, 1);
			dataMap.setInt("supportY", 0, 1);
			quaternion = new Quaternion();
			quaternionManager.put(entity, quaternion);
			dataMap.setBoolean("isMirrorX", false, 1);
			dataMap.setBoolean("isMirrorY", false, 1);
			dataMap.setBoolean("isMirrorZ", false, 1);
		}

		//回転(左)
		if (keyManager.pressed("rotationL") || keyManager.held("rotationL", 300)) {
			const newQuaternion = Quaternion.fromEuler(snapAngle, 0, 0);
			quaternion = newQuaternion.multiply(quaternion); //ワールド上のYaw回転
			quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true); //Y軸スナップ
			quaternionManager.put(entity, quaternion.normalizeSelf());
		}

		//回転(右)
		if (keyManager.pressed("rotationR") || keyManager.held("rotationR", 300)) {
			const newQuaternion = Quaternion.fromEuler(-snapAngle, 0, 0);
			quaternion = newQuaternion.multiply(quaternion); //ワールド上のYaw回転
			quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, true); //Y軸スナップ
			quaternionManager.put(entity, quaternion.normalizeSelf());
		}
	}

	//ーー仮置きモードーー
	//回転モードを解除
	if (isLeftClick) collector.clear(entity);

	if (collector.size(entity) !== 0) {
		//Yaw回転(左)
		if (
			keyManager.pressed("rotationYawL") ||
			keyManager.held("rotationYawL", 300)
		) {
			const newQuaternion = Quaternion.fromEuler(snapAngle, 0, 0);
			if (isWorldAxis)
				quaternion = newQuaternion.multiply(quaternion); //ワールド軸の回転
			else quaternion = quaternion.multiply(newQuaternion); //ローカル軸の回転
			quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, isWorldAxis); //Yawスナップ
			quaternionManager.put(entity, quaternion.normalizeSelf());
		}

		//Yaw回転(右)
		if (
			keyManager.pressed("rotationYawR") ||
			keyManager.held("rotationYawR", 300)
		) {
			const newQuaternion = Quaternion.fromEuler(-snapAngle, 0, 0);
			if (isWorldAxis)
				quaternion = newQuaternion.multiply(quaternion); //ワールド軸の回転
			else quaternion = quaternion.multiply(newQuaternion); //ローカル軸の回転
			quaternion = Quaternion.snapYawDelta(quaternion, snapAngle, isWorldAxis); //Yawスナップ
			quaternionManager.put(entity, quaternion.normalizeSelf());
		}

		//Piitch回転(上)
		if (
			keyManager.pressed("rotationPitchUp") ||
			keyManager.held("rotationPitchUp", 300)
		) {
			const newQuaternion = Quaternion.fromEuler(0, -snapAngle, 0);
			if (isWorldAxis)
				quaternion = newQuaternion.multiply(quaternion); //ワールド軸の回転
			else quaternion = quaternion.multiply(newQuaternion); //ローカル軸の回転
			quaternion = Quaternion.snapPitchDelta(
				quaternion,
				snapAngle,
				isWorldAxis,
			); //Pitchスナップ
			quaternionManager.put(entity, quaternion.normalizeSelf());
		}

		//Piitch回転(下)
		if (
			keyManager.pressed("rotationPitchDown") ||
			keyManager.held("rotationPitchDown", 300)
		) {
			const newQuaternion = Quaternion.fromEuler(0, snapAngle, 0);
			if (isWorldAxis)
				quaternion = newQuaternion.multiply(quaternion); //ワールド軸の回転
			else quaternion = quaternion.multiply(newQuaternion); //ローカル軸の回転
			quaternion = Quaternion.snapPitchDelta(
				quaternion,
				snapAngle,
				isWorldAxis,
			); //Pitchスナップ
			quaternionManager.put(entity, quaternion.normalizeSelf());
		}

		//Roll回転(左)
		if (
			keyManager.pressed("rotationRollL") ||
			keyManager.held("rotationRollL", 300)
		) {
			const newQuaternion = Quaternion.fromEuler(0, 0, -snapAngle);
			if (isWorldAxis)
				quaternion = newQuaternion.multiply(quaternion); //ワールド軸の回転
			else quaternion = quaternion.multiply(newQuaternion); //ローカル軸の回転
			quaternion = Quaternion.snapRollDelta(quaternion, snapAngle, isWorldAxis); //Rollスナップ
			quaternionManager.put(entity, quaternion.normalizeSelf());
		}

		//Roll回転(右)
		if (
			keyManager.pressed("rotationRollR") ||
			keyManager.held("rotationRollR", 300)
		) {
			const newQuaternion = Quaternion.fromEuler(0, 0, snapAngle);
			if (isWorldAxis)
				quaternion = newQuaternion.multiply(quaternion); //ワールド軸の回転
			else quaternion = quaternion.multiply(newQuaternion); //ローカル軸の回転
			quaternion = Quaternion.snapRollDelta(quaternion, snapAngle, isWorldAxis); //Rollスナップ
			quaternionManager.put(entity, quaternion.normalizeSelf());
		}

		//回転をリセット
		if (keyManager.pressed("resetRotation")) {
			quaternion = new Quaternion();
			quaternionManager.put(entity, quaternion);
		}
	}
}

//#################
//##  パーツ登録  ##
//#################
//## グローバル変数として使うための準備 ##
let body: Parts;
let point: Parts;
let selected: Parts;
let placeBlockFrame: Parts;
let handleX: Parts;
let handleY: Parts;
let handleZ: Parts;
let axisX: Parts;
let axisY: Parts;
let axisZ: Parts;
let mirrorX: Parts;
let mirrorY: Parts;
let mirrorZ: Parts;
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
	mirrorX = renderer.registerParts(new Parts("mirrorX"));
	mirrorY = renderer.registerParts(new Parts("mirrorY"));
	mirrorZ = renderer.registerParts(new Parts("mirrorZ"));
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
	const offsetY = dataMap.getInt("offsetY");
	const isBuilding = dataMap.getBoolean("isBuilding");
	const isUndo = dataMap.getBoolean("isUndo");

	//本体
	body.render(renderer);

	//初回選択時にミニチュアブロックのGUIが開くのをブロックする
	const isFirstSelect = dataMap.getBoolean("isFirstSelect");
	if (
		(lookingPos && Mouse.isButtonDown(1) && collector.size(entity) === 0) ||
		isFirstSelect
	) {
		const mc = NGTUtilClient.getMinecraft();
		if (
			mc.currentScreen &&
			RTMApiCompatClient.isMiniatureGui(mc.currentScreen)
		) {
			player.closeScreen();
			dataMap.setBoolean("isFirstSelect", false, 0);
		}
	}

	//カーソル
	if (lookingPos) {
		GL11.glPushMatrix();
		GL11.glTranslatef(
			lookingPos.blockX + 0.5,
			lookingPos.blockY + 0.5 + offsetY,
			lookingPos.blockZ + 0.5,
		);
		GL11.glTranslatef(-posX, -posY, -posZ);
		point.render(renderer);
		GL11.glPopMatrix();
	}

	//選択済み座標
	if (collector.size(entity) > 0) {
		const selectedPos = collector.getAll(entity)[0];
		GL11.glPushMatrix();
		GL11.glTranslatef(
			selectedPos[0] + 0.5,
			selectedPos[1] + 0.5,
			selectedPos[2] + 0.5,
		);
		GL11.glTranslatef(-posX, -posY, -posZ);
		selected.render(renderer);
		GL11.glPopMatrix();
	}

	//NGTOを描画
	const ngtos = NGTOBuilderUtil.getAllInventoryNGTOs(player);
	let ngto: NGTObject | null = null;
	if (ngtos) {
		let ngtosHashKey = "";
		for (let ngtoIdx = 0; ngtoIdx < ngtos.length; ngtoIdx++) {
			const ngto = ngtos[ngtoIdx];
			if (!ngto) continue;
			ngtosHashKey += ngtoIdx + "|" + NGTOBuilderUtil.getNGTOHash(ngto) + "|";
		}
		const ngtoHash = NGTOBuilderUtil.getNGTOCache(entity, ngtosHashKey);
		if (!ngtoHash) {
			const ngtoList: combineNGTOList[] = []; //[[ngto, offsetX, offsetY, offsetZ], ...]
			//データ作成
			let maxSize = 0;
			for (let i = 9; i < ngtos.length; i++) {
				const item = ngtos[i];
				if (item) maxSize = Math.max(maxSize, item.xSize + 1, item.zSize + 1);
			}
			//配列作成
			for (let i = 9; i < ngtos.length; i++) {
				const item = ngtos[i];
				if (item) {
					const offsetX = (i % 9) * maxSize;
					const offsetZ = Math.floor(i / 9) * maxSize;
					ngtoList.push([item, offsetX, 0, offsetZ]);
				}
			}
			if (ngtoList.length > 0) {
				ngto = NGTOBuilderUtil.combineNGTO(ngtoList);
				NGTOBuilderUtil.setNGTOCache(entity, ngtosHashKey, ngto);
			}
		} else ngto = ngtoHash;
	}
	const q = quaternionManager.get(entity);
	const prevNGTO = prevNGTOData.get(entity);
	prevNGTOData.put(entity, ngto);
	const isMirrorX = dataMap.getBoolean("isMirrorX");
	const isMirrorY = dataMap.getBoolean("isMirrorY");
	const isMirrorZ = dataMap.getBoolean("isMirrorZ");
	let scale = 1;
	if (ngto) scale = Math.max(ngto.xSize, ngto.ySize, ngto.zSize) * 1.3;
	if (ngto && q && !isBuilding && !isUndo) {
		let selectedPos = null;
		if (collector.size(entity) > 0) selectedPos = collector.getAll(entity)[0];
		else if (lookingPos)
			selectedPos = [
				lookingPos.blockX,
				lookingPos.blockY + offsetY,
				lookingPos.blockZ,
			];
		if (selectedPos) {
			const centerX2 = ngto.xSize / 2;
			const centerY2 = ngto.ySize / 2;
			const centerZ2 = ngto.zSize / 2;
			const centerX = Math.floor(centerX2) + 0.5;
			const centerZ = Math.floor(centerZ2) + 0.5;
			GL11.glPushMatrix();
			GL11.glTranslatef(
				selectedPos[0] + 0.5,
				selectedPos[1] + 0.5,
				selectedPos[2] + 0.5,
			);
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
			NGTOBuilderUtilClient.renderNGTO(
				prevNGTO !== ngto,
				entity,
				renderer,
				ngto,
				pass,
			);
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
		const isBuildSupportBlocks = dataMap.getBoolean("isBuildSupportBlocks");
		const supportY = dataMap.getInt("supportY");
		const entityId = String(entity.getEntityId());
		const ngtoHash = NGTOBuilderUtil.getNGTOHash(ngto);
		const qHash = q.getHash();
		const hash =
			entityId +
			ngtoHash +
			qHash +
			String(interpolationMode) +
			String(isPlaceAirBlock) +
			String(diffusionRate) +
			String(isMirrorX) +
			String(isMirrorY) +
			String(isMirrorZ) +
			String(supportY) +
			String(isBuildSupportBlocks) +
			String(offsetY);
		let posList = posListCache.get(hash); //相対座標で管理
		if (!posList) {
			const centerX = Math.floor(ngto.xSize / 2) + 0.5;
			const centerZ = Math.floor(ngto.zSize / 2) + 0.5;
			let supportRBO = new RotatableBlockObject();
			if (isBuildSupportBlocks && offsetY - 1 + supportY >= 1) {
				supportRBO = RotatableBlockObjectFactory.createWalls(
					new BlockSet(RTMApiCompat.getBlockStone(), 0),
					ngto.xSize,
					offsetY - 1 + supportY,
					ngto.zSize,
				);
				supportRBO.offset(0, -offsetY + 1 - supportY, 0);
			}
			if (
				ngto.xSize * ngto.ySize * ngto.zSize > 20000 ||
				(interpolationMode === 1 &&
					ngto.xSize * ngto.ySize * ngto.zSize * 8 > 20000)
			) {
				//巨大ブロックは代替表示
				const hugePosList = NGTOBuilderUtilClient.getOutsideFramePosList(ngto);
				const blockObj = RotatableBlockObject.createFromPosList(hugePosList);
				blockObj.merge(supportRBO);
				if (isMirrorX) blockObj.mirrorX();
				if (isMirrorZ) blockObj.mirrorZ();
				if (isMirrorY) blockObj.mirrorY();
				blockObj.setPivot(centerX, 0.5, centerZ);
				blockObj.rotateQ(q);
				blockObj.movePivotToBaseXZ();
				RotatableBlockObjectMapper.toBlockCoordSelf(blockObj);
				posList = RotatableBlockObjectMapper.getPosList(blockObj);
			} else {
				//posListを生成
				const diffusion = BlockDiffusionMode.get(interpolationMode).withRate(
					diffusionRate / 100,
				);
				const blockObj = RotatableBlockObject.createFromNGTO(
					ngto,
					isPlaceAirBlock,
				);
				blockObj.merge(supportRBO);
				if (isMirrorX) blockObj.mirrorX();
				if (isMirrorZ) blockObj.mirrorZ();
				if (isMirrorY) blockObj.mirrorY();
				blockObj.setPivot(centerX, 0.5, centerZ);
				blockObj.rotateQ(q);
				blockObj.movePivotToBaseXZ();
				if (!q.isRightAngleRotation())
					RotatableBlockObjectMapper.applyDiffusionSelf(blockObj, diffusion);
				RotatableBlockObjectMapper.toBlockCoordSelf(blockObj);
				posList = RotatableBlockObjectMapper.getPosList(blockObj);
			}
			posListCache.put(hash, posList);
		}
		//描画
		let selectedPos = null;
		if (collector.size(entity) > 0) selectedPos = collector.getAll(entity)[0];
		else if (lookingPos)
			selectedPos = [
				lookingPos.blockX,
				lookingPos.blockY + offsetY,
				lookingPos.blockZ,
			];
		if (selectedPos) {
			GL11.glPushMatrix();
			GL11.glTranslatef(
				selectedPos[0] + 0.5,
				selectedPos[1] + 0.5,
				selectedPos[2] + 0.5,
			);
			GL11.glTranslatef(-posX, -posY, -posZ);
			NGTOBuilderUtilClient.renderPosListStatic(
				renderer,
				placeBlockFrame,
				entity,
				posList,
			);
			GL11.glPopMatrix();
		}
	}

	//回転ハンドル
	if (q && !isBuilding) {
		const isWorldAxis = dataMap.getBoolean("isWorldAxis");
		let selectedPos = null;
		if (collector.size(entity) > 0) selectedPos = collector.getAll(entity)[0];
		else if (lookingPos)
			selectedPos = [
				lookingPos.blockX,
				lookingPos.blockY + offsetY,
				lookingPos.blockZ,
			];
		if (selectedPos) {
			//回転軸
			GL11.glPushMatrix();
			GL11.glTranslatef(
				selectedPos[0] + 0.5,
				selectedPos[1] + 0.5,
				selectedPos[2] + 0.5,
			);
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
				if (
					keyManager.down("rotationPitchUp") ||
					keyManager.down("rotationPitchDown")
				)
					alphaX = 1;
				if (keyManager.down("rotationYawL") || keyManager.down("rotationYawR"))
					alphaY = 1;
				if (
					keyManager.down("rotationRollL") ||
					keyManager.down("rotationRollR")
				)
					alphaZ = 1;
			} else {
				if (keyManager.down("rotationL") || keyManager.down("rotationR"))
					alphaY = 1;
			}
			GL11.glScalef(scale, scale, scale);
			renderWithAlpha(handleX, alphaX);
			renderWithAlpha(handleY, alphaY);
			renderWithAlpha(handleZ, alphaZ);
			GL11.glPopMatrix();
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
	if (hostPlayerEntityId !== "")
		hostPlayer = world.getEntityByID(
			Number(hostPlayerEntityId),
		) as unknown as EntityPlayer;
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
		if (isLeftClick !== prevIsLeftClick)
			dataMap.setBoolean("prevIsLeftClick", isLeftClick, 0);
		if (isRightClick !== prevIsRightClick)
			dataMap.setBoolean("prevIsRightClick", isRightClick, 0);
		if (renderer.currentMatId === 0 && pass === 0) keyManager.update();
		if (VERSIONS_server != Version && !isVersionChecked) {
			dataMap.setBoolean("isVersionChecked", true, 0);
			NGTLog.sendChatMessage(sender, "§cVersions don't match!");
			NGTLog.sendChatMessage(sender, "§cClient:" + Version);
			NGTLog.sendChatMessage(sender, "§cServer:" + VERSIONS_server);
		}
		const showHelpMessage = dataMap.getBoolean("showHelpMessage");
		if (!showHelpMessage) {
			dataMap.setBoolean("showHelpMessage", true, 0);
			NGTLog.sendChatMessage(sender, keyManager.getDescription("showHelp"));
		}
		if (!isOpenGUI && pass === 0 && renderer.currentMatId === 0)
			keyInput(
				hostPlayer,
				entity,
				!prevIsRightClick && isRightClick,
				!prevIsLeftClick && isLeftClick,
			);
		renderForToolUser(entity, pass, par3);
	}
}

//追加関数
function renderWithAlpha(part: Parts, alpha: number): void {
	NGTOBuilderUtilClient.enableAlpha(alpha);
	part.render(renderer);
	NGTOBuilderUtilClient.disableAlpha();
}

function renderWithScale(
	part: Parts,
	scaleX: number,
	scaleY: number,
	scaleZ: number,
): void {
	GL11.glPushMatrix();
	GL11.glScalef(scaleX, scaleY, scaleZ);
	part.render(renderer);
	GL11.glPopMatrix();
}
