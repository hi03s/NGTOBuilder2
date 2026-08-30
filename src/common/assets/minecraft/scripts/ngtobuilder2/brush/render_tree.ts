import { NGTObject } from "jp.ngt.ngtlib.block";
import { NGTLog } from "jp.ngt.ngtlib.io";
import { MCWrapperClient, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ModelSetVehicle } from "jp.ngt.rtm.modelpack.modelset";
import { ModelObject, Parts, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { HashMap } from "java.util";
import { System } from "java.lang";
import { ICommandSender } from "net.minecraft.command";
import { Entity } from "net.minecraft.entity";
import { EntityPlayer } from "net.minecraft.entity.player";
import { Keyboard, Mouse } from "org.lwjgl.input";
import { GL11 } from "org.lwjgl.opengl";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { InputManager } from "../../lib_hi03toolkit_1_0/lib_InputManager";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import {
	NGTOBuilderUtilClient,
	Pos,
} from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtilClient";
import { Quaternion } from "../../lib_hi03toolkit_1_0/lib_Quaternion";
import { BrushTreeRequest } from "./server_tree";
import {
	createTallTreeNGTO,
	createTreeCandidates,
	getSurfaceY,
	getTreePresetSignature,
	getTreePresets,
	isValidTreeGround,
} from "./tree_common";

declare const renderer: VehiclePartsRenderer;

const DEFAULT_RADIUS = 16;
const MIN_RADIUS = 1;
const MAX_RADIUS = 64;
const DEFAULT_DENSITY = 10;
const DENSITY_STEP = 1;
const KEY_REPEAT_DELAY = 300;
const KEY_REPEAT_INTERVAL = 100;

type LookingPos = {
	posX: number;
	posY: number;
	posZ: number;
	blockX: number;
	blockY: number;
	blockZ: number;
	placeX: number;
	placeY: number;
	placeZ: number;
	side: number;
};

let keyManager: InputManager;
let Version: string;
let body: Parts;
let range: Parts;
let rangeErase: Parts;
let previousTarget: HashMap<Entity, Pos>;
let randomSeed: HashMap<Entity, number>;
let lastGeneratedCenter: HashMap<Entity, Pos>;
let previousEraseTarget: HashMap<Entity, Pos>;
let requestIds: HashMap<Entity, number>;
let repeatTimes: HashMap<string, number>;
let tallTreeCache: HashMap<string, NGTObject>;
let missingBlockWarnings: HashMap<string, boolean>;

function init(par1: ModelSetVehicle, par2: ModelObject): void {
	Version = "2.4";
	keyManager = new InputManager();
	keyManager.setOptionKey(Keyboard.KEY_LCONTROL);
	keyManager.register("showHelp", Keyboard.KEY_H, false, "ヘルプを表示");
	keyManager.register("endEdit", Keyboard.KEY_Q, false, "ツールを終了");
	keyManager.register("undo", Keyboard.KEY_Z, true, "Undo");
	keyManager.register("presetNext", Keyboard.KEY_P, false, "プリセットを切り替え(next)");
	keyManager.register("presetPrev", Keyboard.KEY_P, true, "プリセットを切り替え(prev)");
	keyManager.register("reroll", Keyboard.KEY_R, false, "配置を再抽選");
	keyManager.register("generateOnce", Keyboard.KEY_RETURN, false, "1回生成");
	keyManager.register("radiusUp", Keyboard.KEY_RIGHT, false, "生成半径を1m拡大");
	keyManager.register("radiusDown", Keyboard.KEY_LEFT, false, "生成半径を1m縮小");
	keyManager.register("densityUp", Keyboard.KEY_UP, false, "密度を上げる");
	keyManager.register("densityDown", Keyboard.KEY_DOWN, false, "密度を下げる");
	keyManager.register("reset", Keyboard.KEY_C, false, "半径と密度をリセット");
	previousTarget = new HashMap();
	randomSeed = new HashMap();
	lastGeneratedCenter = new HashMap();
	previousEraseTarget = new HashMap();
	requestIds = new HashMap();
	repeatTimes = new HashMap();
	tallTreeCache = new HashMap();
	missingBlockWarnings = new HashMap();
	body = renderer.registerParts(new Parts("body"));
	range = renderer.registerParts(new Parts("range"));
	rangeErase = renderer.registerParts(new Parts("range_erase"));
	getTreePresets();
}

function samePos(a: Pos | null, b: Pos | null): boolean {
	return !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function repeatPressed(entity: Entity, name: string): boolean {
	const key = `${entity.getEntityId()}:${name}`;
	const now = System.currentTimeMillis();
	if (keyManager.pressed(name)) {
		repeatTimes.put(key, now);
		return true;
	}
	if (!keyManager.down(name)) {
		repeatTimes.remove(key);
		return false;
	}
	if (!keyManager.held(name, KEY_REPEAT_DELAY)) return false;
	const previous = repeatTimes.get(key) || 0;
	if (now - previous < KEY_REPEAT_INTERVAL) return false;
	repeatTimes.put(key, now);
	return true;
}

function updateRandomSession(
	entity: EntityVehicle,
	looking: LookingPos | null,
): number {
	if (!looking) {
		previousTarget.remove(entity);
		randomSeed.remove(entity);
		return 0;
	}
	const pos: Pos = [looking.blockX, looking.blockY, looking.blockZ];
	const previous = previousTarget.get(entity);
	if (!samePos(previous, pos)) {
		previousTarget.put(entity, pos);
		randomSeed.put(entity, Math.floor(Math.random() * 2147483647) + 1);
	}
	return randomSeed.get(entity) || 1;
}

function sendRequest(
	sender: ICommandSender,
	entity: EntityVehicle,
	action: "generate" | "erase",
	looking: LookingPos,
	seed: number,
): void {
	const dataMap = entity.getResourceState().getDataMap();
	let previousId = requestIds.get(entity);
	if (!previousId)
		previousId = Math.floor(Math.random() * 1000000000) + 1;
	const id = previousId >= 2000000000 ? 1 : previousId + 1;
	requestIds.put(entity, id);
	const presets = getTreePresets();
	const preset = presets[dataMap.getInt("treePresetIndex")];
	if (!preset) return;
	if (action === "generate" && preset.missingBlocks.length > 0) {
		const warningKey = `${entity.getEntityId()}:${preset.id}`;
		if (!missingBlockWarnings.get(warningKey)) {
			missingBlockWarnings.put(warningKey, true);
			NGTLog.sendChatMessage(
				sender,
				`§e[NGTO Builder2] ${preset.name}: 次のファイルが見つからないか読み込めないため生成対象から除外しました: ${preset.missingBlocks.join(", ")}`,
			);
		}
	}
	const request: BrushTreeRequest = {
		id: id,
		action: action,
		centerX: looking.blockX,
		centerZ: looking.blockZ,
		radius: dataMap.getInt("brushRadius"),
		density: dataMap.getInt("brushDensity"),
		seed: seed,
		presetId: preset.id,
	};
	NGTOBuilderUtil.sendJsonData(dataMap, "brushRequest", request);
}

function showHelp(sender: ICommandSender): void {
	NGTLog.sendChatMessage(sender, "---NGTO Builder2 樹木ブラシ 操作方法---");
	[
		"endEdit",
		"undo",
		"presetNext",
		"presetPrev",
		"reroll",
		"generateOnce",
		"radiusUp",
		"radiusDown",
		"densityUp",
		"densityDown",
		"reset",
	].forEach((name) => NGTLog.sendChatMessage(sender, keyManager.getDescription(name)));
	NGTLog.sendChatMessage(sender, "[右クリック] 樹木を生成");
	NGTLog.sendChatMessage(sender, "[左クリック] 選択中の樹木を消去");
}

function keyInput(
	hostPlayer: EntityPlayer,
	entity: EntityVehicle,
	partialTicks: number,
	isRightClick: boolean,
	isLeftClick: boolean,
	prevRightClick: boolean,
	prevLeftClick: boolean,
): void {
	const sender = hostPlayer as unknown as ICommandSender;
	const dataMap = entity.getResourceState().getDataMap();
	const looking = NGTOBuilderUtilClient.getLookingPos(partialTicks);
	let seed = updateRandomSession(entity, looking);
	if (!dataMap.getBoolean("brushDefaultsInitialized")) {
		dataMap.setBoolean("brushDefaultsInitialized", true, 0);
		dataMap.setInt("brushRadius", DEFAULT_RADIUS, 1);
		dataMap.setInt("brushDensity", DEFAULT_DENSITY, 1);
		dataMap.setInt("treePresetIndex", 0, 1);
	}
	let radius = dataMap.getInt("brushRadius");
	let density = dataMap.getInt("brushDensity");
	const presets = getTreePresets();
	const serverPresetSignature = dataMap.getString("treePresetSignature");
	const presetMismatch =
		serverPresetSignature !== "" &&
		serverPresetSignature !== getTreePresetSignature();
	if (presetMismatch && !dataMap.getBoolean("treePresetMismatchWarned")) {
		dataMap.setBoolean("treePresetMismatchWarned", true, 0);
		NGTLog.sendChatMessage(
			sender,
			"§c[NGTO Builder2] クライアントとサーバーの樹木プリセットが一致しないため生成を無効化しました",
		);
	}

	if (keyManager.pressed("showHelp")) showHelp(sender);
	if (keyManager.pressed("endEdit")) dataMap.setBoolean("isEndEdit", true, 1);
	if (keyManager.pressed("undo") && dataMap.getBoolean("canUndo") && !dataMap.getBoolean("isBuilding"))
		dataMap.setBoolean("isUndo", true, 1);

	let presetDelta = 0;
	if (keyManager.pressed("presetNext")) presetDelta = 1;
	if (keyManager.pressed("presetPrev")) presetDelta = -1;
	if (presetDelta !== 0 && presets.length > 0) {
		let index = dataMap.getInt("treePresetIndex") + presetDelta;
		index = (index + presets.length) % presets.length;
		dataMap.setInt("treePresetIndex", index, 1);
		NGTLog.sendChatMessage(sender, `[NGTO Builder2] プリセット: ${presets[index].name}`);
	}
	if (keyManager.pressed("reroll") && looking) {
		seed = Math.floor(Math.random() * 2147483647) + 1;
		randomSeed.put(entity, seed);
		NGTLog.sendChatMessage(sender, "[NGTO Builder2] 配置を再抽選");
	}

	if (repeatPressed(entity, "radiusUp")) radius = Math.min(MAX_RADIUS, radius + 1);
	if (repeatPressed(entity, "radiusDown")) radius = Math.max(MIN_RADIUS, radius - 1);
	if (repeatPressed(entity, "densityUp")) density = Math.min(100, density + DENSITY_STEP);
	if (repeatPressed(entity, "densityDown")) density = Math.max(0, density - DENSITY_STEP);
	if (keyManager.pressed("reset")) {
		radius = DEFAULT_RADIUS;
		density = DEFAULT_DENSITY;
	}
	if (radius !== dataMap.getInt("brushRadius")) {
		dataMap.setInt("brushRadius", radius, 1);
	}
	if (density !== dataMap.getInt("brushDensity")) {
		dataMap.setInt("brushDensity", density, 1);
	}

	const isUndo = dataMap.getBoolean("isUndo");
	const generateOnce =
		!!looking &&
		!isUndo &&
		!presetMismatch &&
		keyManager.pressed("generateOnce");
	if (generateOnce && looking)
		sendRequest(sender, entity, "generate", looking, seed);

	if (!generateOnce && looking && !isUndo && !presetMismatch && isLeftClick) {
		const current: Pos = [looking.blockX, looking.blockY, looking.blockZ];
		const previous = previousEraseTarget.get(entity);
		if (!prevLeftClick || !samePos(previous, current)) {
			sendRequest(sender, entity, "erase", looking, seed);
			previousEraseTarget.put(entity, current);
		}
	} else if (!isLeftClick) {
		previousEraseTarget.remove(entity);
	}

	if (
		!generateOnce &&
		looking &&
		!isUndo &&
		!presetMismatch &&
		isRightClick &&
		!isLeftClick
	) {
		const current: Pos = [looking.blockX, looking.blockY, looking.blockZ];
		const previous = lastGeneratedCenter.get(entity);
		const dx = previous ? current[0] - previous[0] : 0;
		const dz = previous ? current[2] - previous[2] : 0;
		if (!prevRightClick || !previous || dx * dx + dz * dz >= radius * radius) {
			sendRequest(sender, entity, "generate", looking, seed);
			lastGeneratedCenter.put(entity, current);
		}
	} else if (!isRightClick) {
		lastGeneratedCenter.remove(entity);
	}
}

function renderRange(
	entity: EntityVehicle,
	partialTicks: number,
	isErasing: boolean,
): void {
	const looking = NGTOBuilderUtilClient.getLookingPos(partialTicks);
	if (!looking) return;
	const dataMap = entity.getResourceState().getDataMap();
	const radiusValue = dataMap.getInt("brushRadius");
	const world = RTMApiCompat.getWorld(entity);
	const y = getSurfaceY(world, looking.blockX, looking.blockZ);
	const pos = NGTOBuilderUtilClient.getInterpolatedPos(entity, partialTicks);
	GL11.glPushMatrix();
	GL11.glTranslatef(looking.blockX + 0.5 - pos[0], y - pos[1], looking.blockZ + 0.5 - pos[2]);
	const horizontalScale = radiusValue * 2;
	GL11.glScalef(horizontalScale, 5, horizontalScale);
	NGTOBuilderUtilClient.enableAlpha(0.25);
	GL11.glDepthMask(false);
	(isErasing ? rangeErase : range).render(renderer);
	NGTOBuilderUtilClient.disableAlpha();
	GL11.glPopMatrix();
}

function getTallTree(
	presetIndex: number,
	ngtoIndex: number,
	extraHeight: number,
	source: NGTObject,
): NGTObject {
	const key = `${presetIndex}:${ngtoIndex}:${extraHeight}`;
	let result = tallTreeCache.get(key);
	if (!result) {
		result = createTallTreeNGTO(source, extraHeight);
		tallTreeCache.put(key, result);
	}
	return result;
}

function renderTreePreview(entity: EntityVehicle, pass: number, partialTicks: number): void {
	const looking = NGTOBuilderUtilClient.getLookingPos(partialTicks);
	if (!looking || Mouse.isButtonDown(0)) return;
	const dataMap = entity.getResourceState().getDataMap();
	const presets = getTreePresets();
	const presetIndex = dataMap.getInt("treePresetIndex");
	const preset = presets[presetIndex];
	if (!preset) return;
	const seed = updateRandomSession(entity, looking);
	const candidates = createTreeCandidates(
		looking.blockX,
		looking.blockZ,
		dataMap.getInt("brushRadius"),
		dataMap.getInt("brushDensity"),
		seed,
		preset.ngtoList.length,
		preset.randomHeight,
	);
	const world = RTMApiCompat.getWorld(entity);
	const pos = NGTOBuilderUtilClient.getInterpolatedPos(entity, partialTicks);
	NGTOBuilderUtilClient.enableAlpha(0.5);
	for (let i = 0; i < candidates.length; i++) {
		const candidate = candidates[i];
		const source = preset.ngtoList[candidate.ngtoIndex];
		if (!source) continue;
		const tree = getTallTree(presetIndex, candidate.ngtoIndex, candidate.extraHeight, source);
		const centerX = Math.floor(tree.xSize / 2) + 0.5;
		const centerZ = Math.floor(tree.zSize / 2) + 0.5;
		const y = getSurfaceY(world, candidate.x, candidate.z);
		if (!isValidTreeGround(world, candidate.x, y, candidate.z)) continue;
		GL11.glPushMatrix();
		GL11.glTranslatef(candidate.x + 0.5 - pos[0], y + 0.5 - pos[1], candidate.z + 0.5 - pos[2]);
		NGTOBuilderUtilClient.glApplyQuaternionMatrix(Quaternion.fromEuler(candidate.yaw, 0, 0));
		GL11.glTranslatef(-centerX, -0.5, -centerZ);
		NGTOBuilderUtilClient.renderNGTOUnique(entity, renderer, tree, pass);
		GL11.glPopMatrix();
	}
	NGTOBuilderUtilClient.disableAlpha();
}

function renderForToolUser(entity: EntityVehicle, pass: number, partialTicks: number): void {
	body.render(renderer);
	renderTreePreview(entity, pass, partialTicks);
	renderRange(entity, partialTicks, Mouse.isButtonDown(0));
}

function render(entity: EntityVehicle, pass: number, partialTicks: number): void {
	if (!entity) {
		body.render(renderer);
		return;
	}
	const dataMap = entity.getResourceState().getDataMap();
	const world = RTMApiCompat.getWorld(entity);
	const player = MCWrapperClient.getPlayer();
	const hostId = dataMap.getString("hostPlayerEntityId");
	const host = hostId === "" ? null : (world.getEntityByID(Number(hostId)) as unknown as EntityPlayer);
	if (!host || host !== player) {
		body.render(renderer);
		return;
	}
	RTMApiCompat.doFollowing(entity, host);
	const right = Mouse.isButtonDown(1);
	const left = Mouse.isButtonDown(0);
	const prevRight = dataMap.getBoolean("prevIsRightClick");
	const prevLeft = dataMap.getBoolean("prevIsLeftClick");
	if (renderer.currentMatId === 0 && pass === 0) keyManager.update();
	if (right !== prevRight) dataMap.setBoolean("prevIsRightClick", right, 0);
	if (left !== prevLeft) dataMap.setBoolean("prevIsLeftClick", left, 0);
	if (!dataMap.getBoolean("showHelpMessage")) {
		dataMap.setBoolean("showHelpMessage", true, 0);
		NGTLog.sendChatMessage(host as unknown as ICommandSender, keyManager.getDescription("showHelp"));
	}
	const serverVersion = dataMap.getString("VERSIONS");
	if (serverVersion !== "" && serverVersion !== Version && !dataMap.getBoolean("isVersionChecked")) {
		dataMap.setBoolean("isVersionChecked", true, 0);
		NGTLog.sendChatMessage(host as unknown as ICommandSender, `§cVersions don't match! Client: ${Version}, Server: ${serverVersion}`);
	}
	if (NGTUtilClient.getMinecraft().currentScreen === null && pass === 0 && renderer.currentMatId === 0)
		keyInput(host, entity, partialTicks, right, left, prevRight, prevLeft);
	renderForToolUser(entity, pass, partialTicks);
}
