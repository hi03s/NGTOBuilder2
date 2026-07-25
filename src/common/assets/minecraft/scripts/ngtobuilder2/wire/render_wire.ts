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
import { InsulatorCollector } from "../../lib_hi03toolkit_1_0/lib_InsulatorCollector";
import { ReceiveData_wire } from "./server_wire";
import { ItemInstalledObject } from "jp.ngt.rtm.item";
import { ItemStack } from "net.minecraft.item";
import { RTMItem } from "jp.ngt.rtm";
import { RTMApiCompatClient } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompatClient";
import { HashMap } from "java.util";
import { Connection } from "jp.ngt.rtm.electric";
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

	//ーー共通ーー
	keyManager.setOptionKey(Keyboard.KEY_LCONTROL); //オプションキー
	keyManager.register("showHelp", Keyboard.KEY_H, false, `ヘルプを表示`);
	keyManager.register("endEdit", Keyboard.KEY_Q, false, `ツールを終了`);
	keyManager.register("build", Keyboard.KEY_RETURN, false, `生成する`);
	keyManager.register("cancelBuild", Keyboard.KEY_BACK, true, `生成を中止する`);
	keyManager.register("undo", Keyboard.KEY_Z, true, `Undo`);
	//ーーカーソル操作ーー
	keyManager.register(
		"selectYUp",
		Keyboard.KEY_UP,
		false,
		`カーソルの高さを上げる`,
	);
	keyManager.register(
		"selectYDown",
		Keyboard.KEY_DOWN,
		false,
		`カーソルの高さを下げる`,
	);
	keyManager.register(
		"resetSelectY",
		Keyboard.KEY_F,
		false,
		`カーソルの高さをリセットする`,
	);
	//keyManager.register("adjustSelectY", Keyboard.KEY_F, true, "カーソルの高さを合わせる");
	keyManager.register(
		"resetSelected",
		Keyboard.KEY_C,
		false,
		`すべての選択をリセットする`,
	);
	keyManager.register(
		"reverseMarker",
		Keyboard.KEY_P,
		false,
		`マーカーを反転する`,
	);

	//-------------------
	//--  ユーザー設定  --
	//-------------------

	//connectorModelList = RTMApiCompatClient.getModelSetList("ModelConnector");
	//wireModelList = RTMApiCompatClient.getModelSetList("ModelWire");
	posCollector = new InsulatorCollector();
	bezierCollector = new BezierCollector();
	connectionCache = new HashMap();
	initParts();
}
let wireModelList: { [name: string]: ModelSetWire };
let connectorModelList: { [name: string]: ModelSetConnector };
var keyManager: InputManager;
var Version: string;
var posCollector: InsulatorCollector;
var bezierCollector: BezierCollector;
var connectionCache: HashMap<string, Connection>;

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
	const offsetHeight = dataMap.getInt("offsetHeight");
	let offsetX = 0;
	let offsetY = 0;
	let offsetZ = 0;
	if (lookingPos) {
		switch (lookingPos.side) {
			case 0:
				offsetY = -offsetHeight;
				break; // 下
			case 1:
				offsetY = offsetHeight;
				break; // 上
			case 2:
				offsetZ = -offsetHeight;
				break; // 北
			case 3:
				offsetZ = offsetHeight;
				break; // 南
			case 4:
				offsetX = -offsetHeight;
				break; // 西
			case 5:
				offsetX = offsetHeight;
				break; // 東
		}
	}
	connectorModelList = connectorModelList
		? connectorModelList
		: RTMApiCompatClient.getModelSetList("ModelConnector");

	if (keyManager.pressed("showHelp")) {
		NGTLog.sendChatMessage(sender, `---NGTO Builder2 ライン設置 操作方法---`);
		//ーー共通ーー
		NGTLog.sendChatMessage(sender, keyManager.getDescription("endEdit"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("build"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("cancelBuild"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("undo"));
		//ーーカーソル操作ーー
		NGTLog.sendChatMessage(sender, `---カーソル操作---`);
		NGTLog.sendChatMessage(sender, `[右クリック] 座標を選択`);
		NGTLog.sendChatMessage(sender, `[左クリック] 最後の選択を解除`);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("selectYUp"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("selectYDown"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("resetSelected"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("resetSelectY"));
		//NGTLog.sendChatMessage(sender, keyManager.getDescription("adjustSelectY"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("reverseMarker"));
	}

	//終了
	if (keyManager.down("endEdit")) {
		dataMap.setBoolean("isEndEdit", true, 1);
	}

	//生成
	const isBuilding = dataMap.getBoolean("isBuilding");
	const isUndo = dataMap.getBoolean("isUndo");
	const posList = posCollector.getAll(entity);
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
		//送信
		const sendData: ReceiveData_wire = {
			posList: posList,
		};
		NGTOBuilderUtil.sendJsonData(dataMap, "sendData", sendData);
		NGTLog.sendChatMessage(sender, "[NGTO Builder2] 生成中...");
	}

	//生成を中止する
	if (keyManager.pressed("cancelBuild") && isBuilding) {
		NGTLog.sendChatMessage(sender, "[NGTO Builder2] 生成を中止");
		dataMap.setBoolean("cancelBuild", true, 1);
	}

	//Undo
	const canUndo = dataMap.getBoolean("canUndo");
	if (keyManager.pressed("undo") && canUndo && !isBuilding && !isUndo) {
		dataMap.setBoolean("isUndo", true, 1);
		NGTLog.sendChatMessage(sender, "[NGTO Builder2] Undo...");
	}

	//座標を追加
	if (lookingPos && isRightClick) {
		const side = lookingPos.side;
		const selX =
			keyManager.downOptionKey() && side !== 4 && side !== 5
				? lookingPos.posX
				: lookingPos.placeX + 0.5;
		const selY =
			keyManager.downOptionKey() && side !== 0 && side !== 1
				? lookingPos.posY
				: lookingPos.placeY + 0.5;
		const selZ =
			keyManager.downOptionKey() && side !== 2 && side !== 3
				? lookingPos.posZ
				: lookingPos.placeZ + 0.5;
		posCollector.add(
			entity,
			selX + offsetX,
			selY + offsetY,
			selZ + offsetZ,
			side,
			0,
		);
		const size = posCollector.size(entity);
		if (size > 1) {
			const list = posCollector.getAll(entity);
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
	}

	//選択を解除
	if (isLeftClick) {
		posCollector.pop(entity);
		bezierCollector.pop(entity);
	}

	//カーソルの高さを上げる
	if (keyManager.pressed("selectYUp")) {
		dataMap.setInt("offsetHeight", offsetHeight + 1, 1);
	}

	//カーソルの高さを下げる
	if (keyManager.pressed("selectYDown")) {
		dataMap.setInt("offsetHeight", offsetHeight - 1, 1);
	}

	//カーソルの高さをリセットする
	if (keyManager.pressed("resetSelectY")) {
		dataMap.setInt("offsetHeight", 0, 1);
	}

	//すべての選択をリセットする
	if (keyManager.pressed("resetSelected")) {
		posCollector.clear(entity);
		bezierCollector.clear(entity);
		dataMap.setInt("offsetHeight", 0, 1);
	}

	//マーカーを反転する
	if (keyManager.pressed("reverseMarker")) {
		posCollector.reverse(entity);
		bezierCollector.clear(entity);
		const list = posCollector.getAll(entity);
		for (let i = 1; i < list.length; i++) {
			const prev = list[i - 1];
			const last = list[i];
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
function initParts(): void {
	//## 描画パーツの設定 ##
	body = renderer.registerParts(new Parts("body"));
	line = renderer.registerParts(new Parts("line"));
	line_selected = renderer.registerParts(new Parts("line_selected"));
	point = renderer.registerParts(new Parts("point"));
	point_block = renderer.registerParts(new Parts("point_block"));
	selected = renderer.registerParts(new Parts("selected"));
	selected_block = renderer.registerParts(new Parts("selected_block"));
	selectedLineArrow = renderer.registerParts(new Parts("selectedLineArrow"));
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
	const offsetHeight = dataMap.getInt("offsetHeight");
	const isBuilding = dataMap.getBoolean("isBuilding");
	const isUndo = dataMap.getBoolean("isUndo");
	const world = RTMApiCompat.getWorld(entity);
	connectorModelList = connectorModelList
		? connectorModelList
		: RTMApiCompatClient.getModelSetList("ModelConnector");
	wireModelList = wireModelList
		? wireModelList
		: RTMApiCompatClient.getModelSetList("ModelWire");
	let offsetX = 0;
	let offsetY = 0;
	let offsetZ = 0;
	if (lookingPos) {
		switch (lookingPos.side) {
			case 0:
				offsetY = -offsetHeight;
				break; // 下
			case 1:
				offsetY = offsetHeight;
				break; // 上
			case 2:
				offsetZ = -offsetHeight;
				break; // 北
			case 3:
				offsetZ = offsetHeight;
				break; // 南
			case 4:
				offsetX = -offsetHeight;
				break; // 西
			case 5:
				offsetX = offsetHeight;
				break; // 東
		}
	}

	//本体
	body.render(renderer);

	//カーソル
	if (lookingPos) {
		const side = lookingPos.side;
		const selX =
			keyManager.downOptionKey() || side === 4 || side === 5
				? lookingPos.posX
				: lookingPos.placeX + 0.5;
		const selY =
			keyManager.downOptionKey() || side === 0 || side === 1
				? lookingPos.posY
				: lookingPos.placeY + 0.5;
		const selZ =
			keyManager.downOptionKey() || side === 2 || side === 3
				? lookingPos.posZ
				: lookingPos.placeZ + 0.5;

		GL11.glPushMatrix();
		GL11.glTranslatef(selX + offsetX, selY + offsetY, selZ + offsetZ);
		GL11.glTranslatef(-posX, -posY, -posZ);
		point.render(renderer);
		GL11.glPopMatrix();

		GL11.glPushMatrix();
		GL11.glTranslatef(
			Math.floor(selX + offsetX) + 0.5,
			Math.floor(selY + offsetY) + 0.5,
			Math.floor(selZ + offsetZ) + 0.5,
		);
		GL11.glTranslatef(-posX, -posY, -posZ);
		point_block.render(renderer);
		GL11.glPopMatrix();
	}

	//選択済み
	//コネクタ
	if (posCollector.size(entity) > 0) {
		const list = posCollector.getAll(entity);
		for (let i = 0; i < list.length; i++) {
			const pos = list[i];
			GL11.glPushMatrix();
			GL11.glTranslatef(
				pos[0] + 0.5 + pos[4],
				pos[1] + 0.5 + pos[5],
				pos[2] + 0.5 + pos[6],
			);
			GL11.glTranslatef(-posX, -posY, -posZ);
			selected.render(renderer);
			GL11.glPopMatrix();

			GL11.glPushMatrix();
			GL11.glTranslatef(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5);
			GL11.glTranslatef(-posX, -posY, -posZ);
			selected_block.render(renderer);
			GL11.glPopMatrix();
		}
	}

	//ワイヤー
	if (bezierCollector.size(entity) > 0) {
		const bezierList = bezierCollector.getAll(entity);
		GL11.glPushMatrix();
		GL11.glTranslatef(-posX, -posY, -posZ);
		for (let i = 0; i < bezierList.length; i++) {
			const bezier = bezierList[i];
			NGTOBuilderUtilClient.renderBezierStatic(renderer, line_selected, bezier);
			NGTOBuilderUtilClient.renderBezierStatic(
				renderer,
				selectedLineArrow,
				bezier,
				10,
			);
		}
		GL11.glPopMatrix();
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
