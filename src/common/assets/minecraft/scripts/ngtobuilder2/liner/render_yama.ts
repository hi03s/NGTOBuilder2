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
import { BezierCurve3D } from "../../lib_hi03toolkit_1_0/lib_BezierCurve3D";
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
	Version = "2.4";
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
		`カーソル高さをリセット/視線先ブロックへ距離調整`,
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
		"useSelectedPeak",
		Keyboard.KEY_P,
		false,
		`選択点の高さを稜線頂点として使う（地表点を自動追加）`,
	);
	keyManager.register(
		"autoBranchMode",
		Keyboard.KEY_U,
		false,
		`節点から追加稜線を自動生成する`,
	);
	keyManager.register(
		"roundnessMode",
		Keyboard.KEY_O,
		false,
		`稜線の丸みを切り替える`,
	);
	keyManager.register(
		"sagMode",
		Keyboard.KEY_I,
		false,
		`峰のたわみを切り替える`,
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

function getSagMode(entity: EntityVehicle): number {
	const dataMap = entity.getResourceState().getDataMap();
	if (!dataMap.getBoolean("sagModeInitialized")) {
		dataMap.setInt("sagMode", 1, 1);
		dataMap.setBoolean("sagModeInitialized", true, 1);
	}
	return dataMap.getInt("sagMode");
}

function getModeName(mode: number): string {
	return ["なし", "標準", "強い"][Math.max(0, Math.min(2, mode))];
}

function rebuildSelectedLines(entity: EntityVehicle): void {
	const posList = posCollector.getAll(entity);
	bezierCollector.clear(entity);
	for (let i = 0; i + 1 < posList.length; i++) {
		const start: [number, number, number] = [
			posList[i][0] + 0.5,
			posList[i][1] + 0.5,
			posList[i][2] + 0.5,
		];
		const end: [number, number, number] = [
			posList[i + 1][0] + 0.5,
			posList[i + 1][1] + 0.5,
			posList[i + 1][2] + 0.5,
		];
		const center = BezierCurve3D.lerpPoint(start, end, 0.5);
		bezierCollector.add(entity, new BezierCurve3D(start, center, end));
	}
}

function findSurfaceBlockY(
	entity: EntityVehicle,
	x: number,
	z: number,
): number | null {
	const world = RTMApiCompat.getWorld(entity);
	const air = RTMApiCompat.getBlockAir();
	for (let y = 255; y >= 0; y--) {
		const block = RTMApiCompat.getBlock(world, x, y, z);
		if (block && block !== air) return y;
	}
	return null;
}

function removeAutoGroundPoint(entity: EntityVehicle): void {
	const dataMap = entity.getResourceState().getDataMap();
	if (!dataMap.getBoolean("hasAutoGroundPoint")) return;
	if (posCollector.size(entity) > 0) posCollector.pop(entity);
	dataMap.setBoolean("hasAutoGroundPoint", false, 0);
}

function addAutoGroundPoint(entity: EntityVehicle): void {
	const dataMap = entity.getResourceState().getDataMap();
	if (!dataMap.getBoolean("useSelectedPeak")) return;
	const lastPos = posCollector.getLastPos(entity);
	if (!lastPos) return;
	const surfaceY = findSurfaceBlockY(entity, lastPos[0], lastPos[2]);
	if (surfaceY === null) return;
	const previousSize = posCollector.size(entity);
	posCollector.add(entity, lastPos[0], surfaceY, lastPos[2]);
	dataMap.setBoolean(
		"hasAutoGroundPoint",
		posCollector.size(entity) > previousSize,
		0,
	);
}

function refreshAutoGroundPoint(entity: EntityVehicle): void {
	removeAutoGroundPoint(entity);
	addAutoGroundPoint(entity);
	rebuildSelectedLines(entity);
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

function createReceiveData(entity: EntityVehicle): ReceiveData_yama | null {
	const posList = posCollector.getAll(entity);
	if (posList.length < 2) return null;
	const settings = getSettings(entity);
	const ridgeHeight = settings[0];
	const ridgeWidth = settings[1];
	let baseY = posList[0][1];
	for (let i = 1; i < posList.length; i++)
		baseY = Math.min(baseY, posList[i][1]);
	const useSelectedPeak = entity
		.getResourceState()
		.getDataMap()
		.getBoolean("useSelectedPeak");
	const nodes: RidgeNode[] = [];
	for (let i = 0; i < posList.length; i++) {
		nodes.push({
			x: posList[i][0],
			z: posList[i][2],
			height: posList[i][1] - baseY + (useSelectedPeak ? 0 : ridgeHeight),
			width: ridgeWidth,
		});
	}
	const dataMap = entity.getResourceState().getDataMap();
	const playerNodeCount =
		posList.length - (dataMap.getBoolean("hasAutoGroundPoint") ? 1 : 0);
	return {
		nodes: nodes,
		baseY: baseY,
		roundnessMode: dataMap.getInt("roundnessMode"),
		sagMode: getSagMode(entity),
		autoBranchMode: dataMap.getBoolean("autoBranchMode"),
		playerNodeCount: playerNodeCount,
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
	const isMiddleClick = Mouse.isButtonDown(2);
	const prevMiddleClick = dataMap.getBoolean("prevMiddleClick");
	if (isMiddleClick !== prevMiddleClick)
		dataMap.setBoolean("prevMiddleClick", isMiddleClick, 0);
	if (keyManager.downOptionKey() && isMiddleClick && !prevMiddleClick) {
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
	if (
		keyManager.downOptionKey() &&
		dataMap.getBoolean("airCursorMode") &&
		mouseWheel !== 0
	) {
		const direction = mouseWheel > 0 ? 1 : -1;
		const distance = Math.max(1, getCursorDistance(entity) + direction);
		dataMap.setInt("cursorDistance", distance, 1);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 空中カーソル距離: ${distance}[m]`,
		);
	}

	if (keyManager.pressed("showHelp")) {
		NGTLog.sendChatMessage(sender, `---NGTO Builder2 山脈生成 操作方法---`);
		NGTLog.sendChatMessage(sender, `[右クリック] 稜線の通過点を追加`);
		NGTLog.sendChatMessage(sender, `[左クリック] 最後の選択を解除`);
		NGTLog.sendChatMessage(
			sender,
			`[CTRL + 中クリック] カーソル選択方法を変更`,
		);
		NGTLog.sendChatMessage(
			sender,
			`[CTRL + マウスホイール] 空中カーソル距離を変更`,
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
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("useSelectedPeak"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("autoBranchMode"),
		);
		NGTLog.sendChatMessage(
			sender,
			keyManager.getDescription("roundnessMode"),
		);
		NGTLog.sendChatMessage(sender, keyManager.getDescription("sagMode"));
	}

	if (keyManager.pressed("endEdit") && !isBuilding) {
		dataMap.setBoolean("isEndEdit", true, 1);
	}

	if (keyManager.pressed("build") && !isBuilding && !isUndo) {
		const sendData = createReceiveData(entity);
		if (!sendData) {
			NGTLog.sendChatMessage(
				sender,
				`[NGTO Builder2] 稜線の通過点を2点以上選択してください`,
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
		removeAutoGroundPoint(entity);
		if (posCollector.size(entity) >= 33) {
			NGTLog.sendChatMessage(
				sender,
				`[NGTO Builder2] 選択稜線は最大32本です`,
			);
		} else
			posCollector.add(
				entity,
				lookingPos.blockX,
				lookingPos.blockY + offsetY,
				lookingPos.blockZ,
			);
		addAutoGroundPoint(entity);
		rebuildSelectedLines(entity);
	}
	if (isLeftClick && posCollector.size(entity) > 0) {
		removeAutoGroundPoint(entity);
		posCollector.pop(entity);
		addAutoGroundPoint(entity);
		rebuildSelectedLines(entity);
	}
	if (keyManager.pressed("selectYUp") || keyManager.held("selectYUp", 300))
		dataMap.setInt("offsetY", offsetY + 1, 1);
	if (
		keyManager.pressed("selectYDown") ||
		keyManager.held("selectYDown", 300)
	)
		dataMap.setInt("offsetY", offsetY - 1, 1);
	if (keyManager.pressed("resetSelectY")) {
		if (dataMap.getBoolean("airCursorMode")) {
			const blockDistance =
				RTMApiCompatClient.getLookingBlockDistance(partialTicks);
			if (blockDistance !== null) {
				const distance = Math.max(1, Math.ceil(blockDistance));
				dataMap.setInt("cursorDistance", distance, 1);
				NGTLog.sendChatMessage(
					sender,
					`[NGTO Builder2] 視線先ブロックまでの距離: ${distance}[m]`,
				);
			} else {
				NGTLog.sendChatMessage(
					sender,
					`[NGTO Builder2] 視線先にブロックがありません`,
				);
			}
		} else dataMap.setInt("offsetY", 0, 1);
	}
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
		dataMap.setBoolean("hasAutoGroundPoint", false, 0);
		dataMap.setInt("ridgeHeight", 12, 1);
		dataMap.setInt("ridgeWidth", 10, 1);
		dataMap.setInt("offsetY", 0, 1);
		dataMap.setBoolean("airCursorMode", false, 1);
		dataMap.setInt("cursorDistance", 30, 1);
		dataMap.setBoolean("autoBranchMode", false, 1);
		dataMap.setInt("roundnessMode", 0, 1);
		dataMap.setInt("sagMode", 1, 1);
		dataMap.setBoolean("sagModeInitialized", true, 1);
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
	if (keyManager.pressed("heightUp") || keyManager.held("heightUp", 300)) {
		ridgeHeight = Math.min(128, ridgeHeight + 1);
		dataMap.setInt("ridgeHeight", ridgeHeight, 1);
	}
	if (
		(keyManager.pressed("heightDown") ||
			keyManager.held("heightDown", 300)) &&
		ridgeHeight > 1
	) {
		ridgeHeight--;
		dataMap.setInt("ridgeHeight", ridgeHeight, 1);
	}
	if (keyManager.pressed("useSelectedPeak")) {
		const useSelectedPeak = !dataMap.getBoolean("useSelectedPeak");
		dataMap.setBoolean("useSelectedPeak", useSelectedPeak, 1);
		refreshAutoGroundPoint(entity);
		NGTLog.sendChatMessage(
			sender,
			useSelectedPeak
				? `[NGTO Builder2] 選択点の高さを稜線頂点として使う: ON`
				: `[NGTO Builder2] 選択点の高さを稜線頂点として使う: OFF`,
		);
	}
	if (keyManager.pressed("autoBranchMode")) {
		const autoBranchMode = !dataMap.getBoolean("autoBranchMode");
		dataMap.setBoolean("autoBranchMode", autoBranchMode, 1);
		NGTLog.sendChatMessage(
			sender,
			autoBranchMode
				? `[NGTO Builder2] 追加稜線の自動生成: ON`
				: `[NGTO Builder2] 追加稜線の自動生成: OFF`,
		);
	}
	if (keyManager.pressed("roundnessMode")) {
		const roundnessMode = (dataMap.getInt("roundnessMode") + 1) % 3;
		dataMap.setInt("roundnessMode", roundnessMode, 1);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 稜線の丸み: ${getModeName(roundnessMode)}`,
		);
	}
	if (keyManager.pressed("sagMode")) {
		const sagMode = (getSagMode(entity) + 1) % 3;
		dataMap.setInt("sagMode", sagMode, 1);
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 峰のたわみ: ${getModeName(sagMode)}`,
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

	if (lookingPos) {
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
	if (sendData) {
		const hashParts = [
			String(entity.getEntityId()),
			String(sendData.baseY),
			String(sendData.roundnessMode),
			String(sendData.sagMode),
			String(sendData.autoBranchMode),
			String(sendData.playerNodeCount),
		];
		for (let i = 0; i < sendData.nodes.length; i++) {
			hashParts.push(String(sendData.nodes[i].x));
			hashParts.push(String(sendData.nodes[i].height));
			hashParts.push(String(sendData.nodes[i].width));
			hashParts.push(String(sendData.nodes[i].z));
		}
		const hash = hashParts.join("|");
		let mesh: MountainSurfaceTriangle[] = meshCache.get(hash);
		if (!mesh) {
			mesh = generateMountainSurfaceTriangles(
				sendData.nodes,
				sendData.baseY,
				sendData.roundnessMode,
				sendData.sagMode,
				sendData.autoBranchMode,
				sendData.playerNodeCount,
			);
			meshCache.put(hash, mesh);
		}
		renderMountainSurface(
			mesh,
			posX,
			posY,
			posZ,
			dataMap.getBoolean("isBuilding"),
		);
	}
}

function renderMountainSurface(
	mesh: MountainSurfaceTriangle[],
	posX: number,
	posY: number,
	posZ: number,
	transparent: boolean,
): void {
	if (mesh.length === 0) return;
	GL11.glPushAttrib(
		GL11.GL_ENABLE_BIT |
			GL11.GL_COLOR_BUFFER_BIT |
			GL11.GL_DEPTH_BUFFER_BIT |
			GL11.GL_CURRENT_BIT |
			GL11.GL_TEXTURE_BIT,
	);
	const uv = RTMApiCompatClient.getGrassTextureUV();
	RTMApiCompatClient.bindBlockTexture(renderer);
	GL11.glPushMatrix();
	GL11.glTranslatef(-posX, -posY, -posZ);
	GL11.glEnable(GL11.GL_TEXTURE_2D);
	GL11.glDisable(GL11.GL_LIGHTING);
	if (transparent) {
		GL11.glEnable(GL11.GL_BLEND);
		GL11.glBlendFunc(GL11.GL_SRC_ALPHA, GL11.GL_ONE_MINUS_SRC_ALPHA);
	} else GL11.glDisable(GL11.GL_BLEND);
	GL11.glDisable(GL11.GL_CULL_FACE);
	GL11.glDepthMask(true);
	const tessellator = NGTTessellator.instance;
	tessellator.startDrawing(GL11.GL_TRIANGLES);
	if (transparent) tessellator.setColorRGBA_F(0.65, 0.9, 0.55, 0.5);
	else tessellator.setColorOpaque_F(0.65, 0.9, 0.55);
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
	GL11.glPopMatrix();
	GL11.glPopAttrib();
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
