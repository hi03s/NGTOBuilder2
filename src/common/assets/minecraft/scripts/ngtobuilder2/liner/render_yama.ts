import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ModelSetVehicle } from "jp.ngt.rtm.modelpack.modelset";
import { ModelObject, Parts, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { ICommandSender } from "net.minecraft.command";
import { EntityPlayer } from "net.minecraft.entity.player";
import { Keyboard, Mouse } from "org.lwjgl.input";
import { NGTOBuilderUtilClient } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtilClient";
import { PositionCollector } from "../../lib_hi03toolkit_1_0/lib_PositionCollector";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { RTMApiCompatClient } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompatClient";
import { GL11 } from "org.lwjgl.opengl";
import { HashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { BezierCollector } from "../../lib_hi03toolkit_1_0/lib_BezierCollector";
import { InputManager } from "../../lib_hi03toolkit_1_0/lib_InputManager";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { ReceiveData_yama } from "./server_yama";
import {
	generateMountainSurfaceTriangles,
	MountainSurfaceTriangle,
	RidgeNode,
} from "./mountain_generator";
import { NGTTessellator } from "jp.ngt.ngtlib.renderer";

declare const renderer: VehiclePartsRenderer;

function init(par1: ModelSetVehicle, par2: ModelObject): void {
	keyManager = new InputManager();
	Version = "2.2";
	keyManager.setOptionKey(Keyboard.KEY_LCONTROL);
	keyManager.register("showHelp", Keyboard.KEY_H, false, `ヘルプを表示`);
	keyManager.register("endEdit", Keyboard.KEY_Q, false, `ツールを終了`);
	keyManager.register("build", Keyboard.KEY_RETURN, false, `山を生成する`);
	keyManager.register(
		"cancelBuild",
		Keyboard.KEY_BACK,
		true,
		`生成を中止する`,
	);
	keyManager.register("undo", Keyboard.KEY_Z, true, `Undo`);
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
	keyManager.register(
		"adjustSelectY",
		Keyboard.KEY_F,
		true,
		`カーソルの高さを合わせる`,
	);
	keyManager.register(
		"resetSelected",
		Keyboard.KEY_C,
		false,
		`選択と設定をリセットする`,
	);
	keyManager.register("widthUp", Keyboard.KEY_RIGHT, true, `山幅を広げる`);
	keyManager.register("widthDown", Keyboard.KEY_LEFT, true, `山幅を狭める`);
	keyManager.register("heightUp", Keyboard.KEY_UP, true, `尾根を高くする`);
	keyManager.register(
		"heightDown",
		Keyboard.KEY_DOWN,
		true,
		`尾根を低くする`,
	);
	keyManager.register(
		"treeMode",
		Keyboard.KEY_P,
		false,
		`木の種類を変更する`,
	);
	keyManager.register(
		"vegetationAmount",
		Keyboard.KEY_P,
		true,
		`木・草花の生成量を変更する`,
	);
	posCollector = new PositionCollector();
	bezierCollector = new BezierCollector();
	meshCache = new HashMap();
	initParts();
}

var keyManager: InputManager;
var Version: string;
var posCollector: PositionCollector;
var bezierCollector: BezierCollector;
var meshCache: HashMap<string, MountainSurfaceTriangle[]>;

function getSettings(entity: EntityVehicle): [number, number] {
	const dataMap = entity.getResourceState().getDataMap();
	let ridgeHeight = dataMap.getInt("ridgeHeight");
	let ridgeWidth = dataMap.getInt("ridgeWidth");
	if (ridgeHeight <= 0) {
		ridgeHeight = 12;
		dataMap.setInt("ridgeHeight", ridgeHeight, 1);
	}
	if (ridgeWidth <= 0) {
		ridgeWidth = 10;
		dataMap.setInt("ridgeWidth", ridgeWidth, 1);
	}
	return [ridgeHeight, ridgeWidth];
}

function getCursorDistance(entity: EntityVehicle): number {
	const dataMap = entity.getResourceState().getDataMap();
	let distance = dataMap.getInt("cursorDistance");
	if (distance <= 0) {
		distance = 30;
		dataMap.setInt("cursorDistance", distance, 1);
	}
	return distance;
}

function getVegetationAmount(entity: EntityVehicle): number {
	const dataMap = entity.getResourceState().getDataMap();
	if (!dataMap.getBoolean("vegetationAmountInitialized")) {
		dataMap.setBoolean("vegetationAmountInitialized", true, 1);
		dataMap.setInt("vegetationAmount", 1, 1);
		return 1;
	}
	return Math.max(0, Math.min(2, dataMap.getInt("vegetationAmount")));
}

function getLookingPos(entity: EntityVehicle, partialTicks: number) {
	const dataMap = entity.getResourceState().getDataMap();
	if (dataMap.getBoolean("airCursorMode")) {
		return RTMApiCompatClient.getLookingPosAtDistance(
			partialTicks,
			getCursorDistance(entity),
		);
	}
	return NGTOBuilderUtilClient.getLookingPos(partialTicks);
}

function getTreeModeName(mode: number): string {
	return ["オーク", "シラカバ", "マツ", "オーク+シラカバ"][mode] || "オーク";
}

function getVegetationAmountName(amount: number): string {
	return ["少ない", "標準", "多い"][amount] || "標準";
}

function createReceiveData(entity: EntityVehicle): ReceiveData_yama | null {
	const posList = posCollector.getAll(entity);
	if (posList.length !== 2) return null;
	const settings = getSettings(entity);
	const ridgeHeight = settings[0];
	const ridgeWidth = settings[1];
	const baseY = Math.min(posList[0][1], posList[1][1]);
	const a: RidgeNode = {
		x: posList[0][0],
		z: posList[0][2],
		height: ridgeHeight + posList[0][1] - baseY,
		width: ridgeWidth,
	};
	const b: RidgeNode = {
		x: posList[1][0],
		z: posList[1][2],
		height: ridgeHeight + posList[1][1] - baseY,
		width: ridgeWidth,
	};
	return {
		a: a,
		b: b,
		baseY: baseY,
		treeMode: Math.max(
			0,
			Math.min(
				3,
				entity.getResourceState().getDataMap().getInt("treeMode"),
			),
		),
		vegetationAmount: getVegetationAmount(entity),
	};
}

function keyInput(
	hostPlayer: EntityPlayer,
	entity: EntityVehicle,
	partialTicks: number,
	isRightClick: boolean,
	isLeftClick: boolean,
): void {
	const sender = hostPlayer as unknown as ICommandSender;
	const dataMap = entity.getResourceState().getDataMap();
	const lookingPos = getLookingPos(entity, partialTicks);
	const offsetY = dataMap.getInt("offsetY");
	const settings = getSettings(entity);
	let ridgeHeight = settings[0];
	let ridgeWidth = settings[1];
	const isBuilding = dataMap.getBoolean("isBuilding");
	const isUndo = dataMap.getBoolean("isUndo");
	getVegetationAmount(entity);

	const isMiddleClick = Mouse.isButtonDown(2);
	const prevMiddleClick = dataMap.getBoolean("prevMiddleClick");
	if (isMiddleClick !== prevMiddleClick)
		dataMap.setBoolean("prevMiddleClick", isMiddleClick, 0);
	if (isMiddleClick && !prevMiddleClick) {
		const airCursorMode = !dataMap.getBoolean("airCursorMode");
		dataMap.setBoolean("airCursorMode", airCursorMode, 1);
		NGTLog.sendChatMessage(
			sender,
			airCursorMode
				? `[NGTO Builder2] カーソル: 空中選択 (${getCursorDistance(entity)}[m])`
				: `[NGTO Builder2] カーソル: ブロック選択`,
		);
	}
	const mouseWheel = Mouse.getDWheel();
	if (dataMap.getBoolean("airCursorMode") && mouseWheel !== 0) {
		const direction = mouseWheel > 0 ? 1 : -1;
		const distance = Math.max(
			1,
			Math.min(256, getCursorDistance(entity) + direction),
		);
		dataMap.setInt("cursorDistance", distance, 1);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 空中カーソル距離: ${distance}[m]`,
		);
	}

	if (keyManager.pressed("showHelp")) {
		NGTLog.sendChatMessage(sender, `---NGTO Builder2 山脈生成 操作方法---`);
		NGTLog.sendChatMessage(sender, `[右クリック] 尾根の始点・終点を選択`);
		NGTLog.sendChatMessage(sender, `[左クリック] 最後の選択を解除`);
		NGTLog.sendChatMessage(sender, `[中クリック] カーソル選択方法を変更`);
		NGTLog.sendChatMessage(
			sender,
			`[マウスホイール] 空中カーソル距離を変更`,
		);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("build"));
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("cancelBuild"),
		);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("undo"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("selectYUp"));
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("selectYDown"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("resetSelectY"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("adjustSelectY"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("resetSelected"),
		);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("widthUp"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("widthDown"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("heightUp"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("heightDown"));
		NGTLog.sendChatMessage(sender, keyManager.getDescription("treeMode"));
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("vegetationAmount"),
		);
	}

	if (keyManager.pressed("endEdit") && !isBuilding) {
		dataMap.setBoolean("isEndEdit", true, 1);
	}

	if (keyManager.pressed("build") && !isBuilding && !isUndo) {
		const sendData = createReceiveData(entity);
		if (!sendData) {
			NGTLog.sendChatMessage(
				sender,
				`[NGTO Builder2] 始点と終点の2点を選択してください`,
			);
		} else {
			dataMap.setBoolean("isBuilding", true, 1);
			NGTOBuilderUtil.sendJsonData(dataMap, "sendData", sendData);
			NGTLog.sendChatMessage(sender, `[NGTO Builder2] 山を生成中...`);
		}
	}

	if (keyManager.pressed("cancelBuild") && isBuilding) {
		NGTLog.sendChatMessage(sender, `[NGTO Builder2] 生成を中止`);
		dataMap.setBoolean("cancelBuild", true, 1);
	}
	const canUndo = dataMap.getBoolean("canUndo");
	if (keyManager.pressed("undo") && canUndo && !isBuilding && !isUndo) {
		dataMap.setBoolean("isUndo", true, 1);
		NGTLog.sendChatMessage(sender, `[NGTO Builder2] Undo...`);
	}

	if (lookingPos && isRightClick) {
		if (posCollector.size(entity) < 2) {
			posCollector.add(
				entity,
				lookingPos.blockX,
				lookingPos.blockY + offsetY,
				lookingPos.blockZ,
			);
			bezierCollector.createFromPosList(
				entity,
				posCollector.getAll(entity),
			);
		} else {
			NGTLog.sendChatMessage(
				sender,
				`[NGTO Builder2] 選択できる座標は2点です`,
			);
		}
	}
	if (isLeftClick && posCollector.size(entity) > 0) {
		posCollector.pop(entity);
		bezierCollector.createFromPosList(entity, posCollector.getAll(entity));
	}
	if (keyManager.pressed("selectYUp"))
		dataMap.setInt("offsetY", offsetY + 1, 1);
	if (keyManager.pressed("selectYDown"))
		dataMap.setInt("offsetY", offsetY - 1, 1);
	if (keyManager.pressed("resetSelectY")) dataMap.setInt("offsetY", 0, 1);
	if (
		keyManager.pressed("adjustSelectY") &&
		lookingPos &&
		posCollector.size(entity) > 0
	) {
		const lastPos = posCollector.getLastPos(entity);
		if (lastPos)
			dataMap.setInt("offsetY", lastPos[1] - lookingPos.blockY, 1);
	}
	if (keyManager.pressed("resetSelected")) {
		posCollector.clear(entity);
		bezierCollector.clear(entity);
		dataMap.setInt("ridgeHeight", 12, 1);
		dataMap.setInt("ridgeWidth", 10, 1);
		dataMap.setInt("offsetY", 0, 1);
		dataMap.setBoolean("airCursorMode", false, 1);
		dataMap.setInt("cursorDistance", 30, 1);
		dataMap.setInt("treeMode", 0, 1);
		dataMap.setInt("vegetationAmount", 1, 1);
		dataMap.setBoolean("vegetationAmountInitialized", true, 1);
	}
	if (keyManager.pressed("widthUp") || keyManager.held("widthUp", 300)) {
		ridgeWidth = Math.min(128, ridgeWidth + 1);
		dataMap.setInt("ridgeWidth", ridgeWidth, 1);
	}
	if (
		(keyManager.pressed("widthDown") ||
			keyManager.held("widthDown", 300)) &&
		ridgeWidth > 1
	) {
		ridgeWidth--;
		dataMap.setInt("ridgeWidth", ridgeWidth, 1);
	}
	if (keyManager.pressed("heightUp")) {
		ridgeHeight = Math.min(128, ridgeHeight + 1);
		dataMap.setInt("ridgeHeight", ridgeHeight, 1);
	}
	if (keyManager.pressed("heightDown") && ridgeHeight > 1) {
		ridgeHeight--;
		dataMap.setInt("ridgeHeight", ridgeHeight, 1);
	}
	if (keyManager.pressed("treeMode")) {
		const treeMode = (dataMap.getInt("treeMode") + 1) % 4;
		dataMap.setInt("treeMode", treeMode, 1);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 木の種類: ${getTreeModeName(treeMode)}`,
		);
	}
	if (keyManager.pressed("vegetationAmount")) {
		const amount = (getVegetationAmount(entity) + 1) % 3;
		dataMap.setInt("vegetationAmount", amount, 1);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 木・草花の生成量: ${getVegetationAmountName(amount)}`,
		);
	}
}

let body: Parts;
let point: Parts;
let selected: Parts;
let selectedLine: Parts;
let selectedLineArrow: Parts;

function initParts(): void {
	body = renderer.registerParts(new Parts("body"));
	point = renderer.registerParts(new Parts("point"));
	selected = renderer.registerParts(new Parts("selected"));
	selectedLine = renderer.registerParts(new Parts("selectedLine"));
	selectedLineArrow = renderer.registerParts(new Parts("selectedLineArrow"));
}

function renderForToolUser(
	entity: EntityVehicle,
	pass: number,
	partialTicks: number,
): void {
	const dataMap = entity.getResourceState().getDataMap();
	const lookingPos = getLookingPos(entity, partialTicks);
	const entityPos = NGTOBuilderUtilClient.getInterpolatedPos(
		entity,
		partialTicks,
	);
	const posX = entityPos[0];
	const posY = entityPos[1];
	const posZ = entityPos[2];
	const offsetY = dataMap.getInt("offsetY");
	body.render(renderer);

	if (lookingPos && posCollector.size(entity) < 2) {
		GL11.glPushMatrix();
		GL11.glTranslatef(
			lookingPos.blockX + 0.5 - posX,
			lookingPos.blockY + 0.5 + offsetY - posY,
			lookingPos.blockZ + 0.5 - posZ,
		);
		point.render(renderer);
		GL11.glPopMatrix();
	}

	if (bezierCollector.size(entity) > 0) {
		const bezierList = bezierCollector.getAll(entity);
		const cullEnabled = GL11.glIsEnabled(GL11.GL_CULL_FACE);
		bezierList.forEach((bezier) => {
			GL11.glPushMatrix();
			GL11.glTranslatef(-posX, -posY, -posZ);
			GL11.glDisable(GL11.GL_DEPTH_TEST);
			GL11.glEnable(GL11.GL_CULL_FACE);
			NGTOBuilderUtilClient.renderBezierStatic(
				renderer,
				selectedLine,
				bezier,
			);
			NGTOBuilderUtilClient.renderBezierStatic(
				renderer,
				selectedLineArrow,
				bezier,
				10,
			);
			GL11.glEnable(GL11.GL_DEPTH_TEST);
			if (!cullEnabled) GL11.glDisable(GL11.GL_CULL_FACE);
			NGTOBuilderUtilClient.renderBezierStatic(
				renderer,
				selectedLine,
				bezier,
			);
			GL11.glPopMatrix();
		});
	}

	if (posCollector.size(entity) > 0) {
		GL11.glPushMatrix();
		GL11.glTranslatef(-posX + 0.5, -posY + 0.5, -posZ + 0.5);
		NGTOBuilderUtilClient.renderPosListStatic(
			renderer,
			selected,
			entity,
			posCollector.getAll(entity),
		);
		GL11.glPopMatrix();
	}

	const sendData = createReceiveData(entity);
	if (sendData && pass === 0) {
		const hash = [
			String(entity.getEntityId()),
			String(sendData.a.x),
			String(sendData.a.height),
			String(sendData.a.width),
			String(sendData.a.z),
			String(sendData.b.x),
			String(sendData.b.height),
			String(sendData.b.width),
			String(sendData.b.z),
			String(sendData.baseY),
		].join("|");
		let mesh: MountainSurfaceTriangle[] = meshCache.get(hash);
		if (!mesh) {
			mesh = generateMountainSurfaceTriangles(
				sendData.a,
				sendData.b,
				sendData.baseY,
			);
			meshCache.put(hash, mesh);
		}
		renderMountainSurface(mesh, posX, posY, posZ);
	}
}

function renderMountainSurface(
	mesh: MountainSurfaceTriangle[],
	posX: number,
	posY: number,
	posZ: number,
): void {
	if (mesh.length === 0) return;
	const blendEnabled = GL11.glIsEnabled(GL11.GL_BLEND);
	const cullEnabled = GL11.glIsEnabled(GL11.GL_CULL_FACE);
	const uv = RTMApiCompatClient.getGrassTextureUV();
	RTMApiCompatClient.bindBlockTexture(renderer);
	GL11.glPushMatrix();
	GL11.glTranslatef(-posX, -posY, -posZ);
	GL11.glEnable(GL11.GL_BLEND);
	GL11.glBlendFunc(GL11.GL_SRC_ALPHA, GL11.GL_ONE_MINUS_SRC_ALPHA);
	GL11.glDisable(GL11.GL_CULL_FACE);
	GL11.glDepthMask(false);
	const tessellator = NGTTessellator.instance;
	tessellator.startDrawing(GL11.GL_TRIANGLES);
	tessellator.setColorRGBA_F(0.65, 0.9, 0.55, 0.5);
	for (let i = 0; i < mesh.length; i++) {
		const triangle = mesh[i];
		tessellator.addVertexWithUV(
			triangle[0][0],
			triangle[0][1],
			triangle[0][2],
			uv[0],
			uv[1],
		);
		tessellator.addVertexWithUV(
			triangle[1][0],
			triangle[1][1],
			triangle[1][2],
			uv[2],
			uv[1],
		);
		tessellator.addVertexWithUV(
			triangle[2][0],
			triangle[2][1],
			triangle[2][2],
			uv[2],
			uv[3],
		);
	}
	tessellator.draw();
	GL11.glDepthMask(true);
	if (cullEnabled) GL11.glEnable(GL11.GL_CULL_FACE);
	if (!blendEnabled) GL11.glDisable(GL11.GL_BLEND);
	GL11.glPopMatrix();
}

function renderForOtherUser(
	entity: EntityVehicle,
	pass: number,
	partialTicks: number,
): void {
	body.render(renderer);
}

function renderInMenu(): void {
	body.render(renderer);
}

function render(
	entity: EntityVehicle,
	pass: number,
	partialTicks: number,
): void {
	if (!entity) {
		renderInMenu();
		return;
	}
	const dataMap = entity.getResourceState().getDataMap();
	const isOpenGUI = NGTUtilClient.getMinecraft().currentScreen !== null;
	const world = RTMApiCompat.getWorld(entity);
	const player = MCWrapperClient.getPlayer();
	const hostPlayerEntityId = dataMap.getString("hostPlayerEntityId");
	let hostPlayer: EntityPlayer | null = null;
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
		renderForOtherUser(entity, pass, partialTicks);
		return;
	}
	const sender = hostPlayer as unknown as ICommandSender;
	const isLeftClick = Mouse.isButtonDown(0);
	const isRightClick = Mouse.isButtonDown(1);
	const serverVersion = dataMap.getString("VERSIONS");
	const isVersionChecked = dataMap.getBoolean("isVersionChecked");
	RTMApiCompat.doFollowing(entity, hostPlayer);
	if (hostPlayer === player) {
		if (isLeftClick !== prevIsLeftClick)
			dataMap.setBoolean("prevIsLeftClick", isLeftClick, 0);
		if (isRightClick !== prevIsRightClick)
			dataMap.setBoolean("prevIsRightClick", isRightClick, 0);
		if (renderer.currentMatId === 0 && pass === 0) keyManager.update();
		if (
			serverVersion !== "" &&
			serverVersion !== Version &&
			!isVersionChecked
		) {
			dataMap.setBoolean("isVersionChecked", true, 0);
			NGTLog.sendChatMessage(sender, `§cVersions don't match!`);
			NGTLog.sendChatMessage(sender, `§cClient: ${Version}`);
			NGTLog.sendChatMessage(sender, `§cServer: ${serverVersion}`);
		}
		if (!dataMap.getBoolean("showHelpMessage")) {
			dataMap.setBoolean("showHelpMessage", true, 0);
			NGTLog.sendChatMessage(
				sender,
				keyManager.getDescription("showHelp"),
			);
		}
		if (!isOpenGUI && pass === 0 && renderer.currentMatId === 0) {
			keyInput(
				hostPlayer,
				entity,
				partialTicks,
				!prevIsRightClick && isRightClick,
				!prevIsLeftClick && isLeftClick,
			);
		}
		renderForToolUser(entity, pass, partialTicks);
	}
}
