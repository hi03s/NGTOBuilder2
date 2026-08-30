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
import { BrushSnowfallRequest } from "./server_snowfall";

declare const renderer: VehiclePartsRenderer;

const DEFAULT_RADIUS = 16;
const MIN_RADIUS = 1;
const MAX_RADIUS = 64;
const DEFAULT_DENSITY = 30;
const DENSITY_STEP = 1;
const DEFAULT_MAX_THICKNESS = 2;
const DEFAULT_INCREMENT = 1;
const MAX_THICKNESS = 24;
const BRUSH_SETTINGS_VERSION = 2;
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
let previousMeltTarget: HashMap<Entity, Pos>;
let previousLeftAction: HashMap<Entity, string>;
let previousRightAction: HashMap<Entity, string>;
let requestIds: HashMap<Entity, number>;
let repeatTimes: HashMap<string, number>;

function init(par1: ModelSetVehicle, par2: ModelObject): void {
	Version = "2.3";
	keyManager = new InputManager();
	keyManager.setOptionKey(Keyboard.KEY_LCONTROL);
	keyManager.register("showHelp", Keyboard.KEY_H, false, "ヘルプを表示");
	keyManager.register("endEdit", Keyboard.KEY_Q, false, "ツールを終了");
	keyManager.register("undo", Keyboard.KEY_Z, true, "Undo");
	keyManager.register(
		"accumulateOnce",
		Keyboard.KEY_RETURN,
		false,
		"1回積雪",
	);
	keyManager.register(
		"radiusUp",
		Keyboard.KEY_RIGHT,
		false,
		"生成半径を1m拡大",
	);
	keyManager.register(
		"radiusDown",
		Keyboard.KEY_LEFT,
		false,
		"生成半径を1m縮小",
	);
	keyManager.register("densityUp", Keyboard.KEY_UP, false, "密度を上げる");
	keyManager.register(
		"densityDown",
		Keyboard.KEY_DOWN,
		false,
		"密度を下げる",
	);
	keyManager.register(
		"maxThicknessUp",
		Keyboard.KEY_UP,
		true,
		"積雪上限を1/8ブロック上げる",
	);
	keyManager.register(
		"maxThicknessDown",
		Keyboard.KEY_DOWN,
		true,
		"積雪上限を1/8ブロック下げる",
	);
	keyManager.register(
		"incrementUp",
		Keyboard.KEY_RIGHT,
		true,
		"積雪増加量を1/8ブロック上げる",
	);
	keyManager.register(
		"incrementDown",
		Keyboard.KEY_LEFT,
		true,
		"積雪増加量を1/8ブロック下げる",
	);
	keyManager.register(
		"biomeFill",
		Keyboard.KEY_P,
		false,
		"バイオーム範囲置換を切り替える",
	);
	keyManager.register("reset", Keyboard.KEY_C, false, "半径と密度をリセット");
	previousTarget = new HashMap();
	randomSeed = new HashMap();
	lastGeneratedCenter = new HashMap();
	previousMeltTarget = new HashMap();
	previousLeftAction = new HashMap();
	previousRightAction = new HashMap();
	requestIds = new HashMap();
	repeatTimes = new HashMap();
	body = renderer.registerParts(new Parts("body"));
	range = renderer.registerParts(new Parts("range"));
	rangeErase = renderer.registerParts(new Parts("range_erase"));
}

function samePos(a: Pos | null, b: Pos | null): boolean {
	return !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function ensureBrushDefaults(entity: EntityVehicle): void {
	const dataMap = entity.getResourceState().getDataMap();
	if (dataMap.getInt("snowfallSettingsVersion") === BRUSH_SETTINGS_VERSION)
		return;
	dataMap.setInt("snowfallRadius", DEFAULT_RADIUS, 0);
	dataMap.setInt("snowfallDensity", DEFAULT_DENSITY, 0);
	dataMap.setInt("snowfallMaxThickness", DEFAULT_MAX_THICKNESS, 0);
	dataMap.setInt("snowfallIncrement", DEFAULT_INCREMENT, 0);
	dataMap.setBoolean("snowfallBiomeFill", false, 0);
	dataMap.setInt("snowfallSettingsVersion", BRUSH_SETTINGS_VERSION, 0);
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
	entity: EntityVehicle,
	action: "accumulate" | "melt" | "mound" | "smooth",
	looking: LookingPos,
	seed: number,
): void {
	const dataMap = entity.getResourceState().getDataMap();
	let previousId = requestIds.get(entity);
	if (!previousId) previousId = Math.floor(Math.random() * 1000000000) + 1;
	const id = previousId >= 2000000000 ? 1 : previousId + 1;
	requestIds.put(entity, id);
	const request: BrushSnowfallRequest = {
		id: id,
		action: action,
		centerX: looking.blockX,
		centerZ: looking.blockZ,
		radius: dataMap.getInt("snowfallRadius"),
		density: dataMap.getInt("snowfallDensity"),
		seed: seed,
		maxThickness: dataMap.getInt("snowfallMaxThickness"),
		increment: dataMap.getInt("snowfallIncrement"),
		biomeFill: dataMap.getBoolean("snowfallBiomeFill"),
	};
	NGTOBuilderUtil.sendJsonData(dataMap, "snowfallRequest", request);
}

function showHelp(sender: ICommandSender): void {
	NGTLog.sendChatMessage(sender, "---NGTO Builder2 積雪ブラシ 操作方法---");
	[
		"endEdit",
		"undo",
		"accumulateOnce",
		"radiusUp",
		"radiusDown",
		"densityUp",
		"densityDown",
		"maxThicknessUp",
		"maxThicknessDown",
		"incrementUp",
		"incrementDown",
		"biomeFill",
		"reset",
	].forEach((name) =>
		NGTLog.sendChatMessage(sender, keyManager.getDescription(name)),
	);
	NGTLog.sendChatMessage(sender, "[右クリック] 雪を積もらせる");
	NGTLog.sendChatMessage(sender, "[左クリック] 雪を溶かす");
	NGTLog.sendChatMessage(sender, "[CTRL + 右クリック] 雪を盛る");
	NGTLog.sendChatMessage(sender, "[CTRL + 左クリック] 雪を均す");
}

function renewRandom(entity: EntityVehicle): void {
	randomSeed.put(entity, Math.floor(Math.random() * 2147483647) + 1);
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
	ensureBrushDefaults(entity);
	let radius = dataMap.getInt("snowfallRadius");
	let density = dataMap.getInt("snowfallDensity");
	let maxThickness = dataMap.getInt("snowfallMaxThickness");
	let increment = dataMap.getInt("snowfallIncrement");
	let biomeFill = dataMap.getBoolean("snowfallBiomeFill");
	if (keyManager.pressed("showHelp")) showHelp(sender);
	if (keyManager.pressed("endEdit")) dataMap.setBoolean("isEndEdit", true, 1);
	if (
		keyManager.pressed("undo") &&
		dataMap.getBoolean("canUndo") &&
		!dataMap.getBoolean("isBuilding")
	)
		dataMap.setBoolean("isUndo", true, 1);
	if (repeatPressed(entity, "radiusUp"))
		radius = Math.min(MAX_RADIUS, radius + 1);
	if (repeatPressed(entity, "radiusDown"))
		radius = Math.max(MIN_RADIUS, radius - 1);
	if (repeatPressed(entity, "densityUp"))
		density = Math.min(100, density + DENSITY_STEP);
	if (repeatPressed(entity, "densityDown"))
		density = Math.max(0, density - DENSITY_STEP);
	const previousMaxThickness = maxThickness;
	const previousIncrement = increment;
	if (repeatPressed(entity, "maxThicknessUp"))
		maxThickness = Math.min(MAX_THICKNESS, maxThickness + 1);
	if (repeatPressed(entity, "maxThicknessDown"))
		maxThickness = Math.max(1, maxThickness - 1);
	if (repeatPressed(entity, "incrementUp"))
		increment = Math.min(MAX_THICKNESS, increment + 1);
	if (repeatPressed(entity, "incrementDown"))
		increment = Math.max(1, increment - 1);
	if (keyManager.pressed("biomeFill")) {
		biomeFill = !biomeFill;
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] バイオーム範囲置換: ${biomeFill ? "ON" : "OFF"}`,
		);
	}
	if (maxThickness !== previousMaxThickness)
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 積雪上限: ${maxThickness}/8`,
		);
	if (increment !== previousIncrement)
		NGTLog.sendChatMessage(
			sender,
			`[NGTO Builder2] 積雪増加量: +${increment}/8`,
		);
	if (keyManager.pressed("reset")) {
		radius = DEFAULT_RADIUS;
		density = DEFAULT_DENSITY;
		maxThickness = DEFAULT_MAX_THICKNESS;
		increment = DEFAULT_INCREMENT;
		biomeFill = false;
		NGTLog.sendChatMessage(sender, "[NGTO Builder2] 積雪上限: 2/8");
		NGTLog.sendChatMessage(sender, "[NGTO Builder2] 積雪増加量: +1/8");
		NGTLog.sendChatMessage(
			sender,
			"[NGTO Builder2] バイオーム範囲置換: OFF",
		);
	}
	if (radius !== dataMap.getInt("snowfallRadius"))
		dataMap.setInt("snowfallRadius", radius, 1);
	if (density !== dataMap.getInt("snowfallDensity"))
		dataMap.setInt("snowfallDensity", density, 1);
	if (maxThickness !== dataMap.getInt("snowfallMaxThickness"))
		dataMap.setInt("snowfallMaxThickness", maxThickness, 1);
	if (increment !== dataMap.getInt("snowfallIncrement"))
		dataMap.setInt("snowfallIncrement", increment, 1);
	if (biomeFill !== dataMap.getBoolean("snowfallBiomeFill"))
		dataMap.setBoolean("snowfallBiomeFill", biomeFill, 1);
	const isUndo = dataMap.getBoolean("isUndo");
	if (looking && !isUndo && keyManager.pressed("accumulateOnce")) {
		sendRequest(entity, "accumulate", looking, seed);
		renewRandom(entity);
	}
	const ctrl = keyManager.downOptionKey();
	if (looking && !isUndo && isLeftClick) {
		const current: Pos = [looking.blockX, looking.blockY, looking.blockZ];
		const previous = previousMeltTarget.get(entity);
		const action = ctrl ? "smooth" : "melt";
		if (
			!prevLeftClick ||
			!samePos(previous, current) ||
			previousLeftAction.get(entity) !== action
		) {
			sendRequest(entity, action, looking, seed);
			previousMeltTarget.put(entity, current);
			previousLeftAction.put(entity, action);
		}
	} else {
		previousMeltTarget.remove(entity);
		previousLeftAction.remove(entity);
	}
	if (looking && !isUndo && isRightClick) {
		const current: Pos = [looking.blockX, looking.blockY, looking.blockZ];
		const previous = lastGeneratedCenter.get(entity);
		const action = ctrl ? "mound" : "accumulate";
		const movedFarEnough =
			!previous ||
			Math.sqrt(
				(current[0] - previous[0]) * (current[0] - previous[0]) +
					(current[2] - previous[2]) * (current[2] - previous[2]),
			) >= radius;
		if (
			!prevRightClick ||
			movedFarEnough ||
			previousRightAction.get(entity) !== action
		) {
			sendRequest(entity, action, looking, seed);
			lastGeneratedCenter.put(entity, current);
			previousRightAction.put(entity, action);
			renewRandom(entity);
		}
	} else {
		lastGeneratedCenter.remove(entity);
		previousRightAction.remove(entity);
	}
}

function getSurfaceY(entity: EntityVehicle, x: number, z: number): number {
	const world = RTMApiCompat.getWorld(entity);
	const air = RTMApiCompat.getBlockAir();
	for (let y = 255; y >= 0; y--) {
		const block = RTMApiCompat.getBlock(world, x, y, z);
		if (block && block !== air) return y + 1;
	}
	return 0;
}

function renderRange(
	entity: EntityVehicle,
	partialTicks: number,
	isMelting: boolean,
): void {
	const looking = NGTOBuilderUtilClient.getLookingPos(partialTicks);
	if (!looking) return;
	const dataMap = entity.getResourceState().getDataMap();
	const radius = dataMap.getInt("snowfallRadius");
	const y = getSurfaceY(entity, looking.blockX, looking.blockZ);
	const pos = NGTOBuilderUtilClient.getInterpolatedPos(entity, partialTicks);
	GL11.glPushMatrix();
	GL11.glTranslatef(
		looking.blockX + 0.5 - pos[0],
		y - pos[1],
		looking.blockZ + 0.5 - pos[2],
	);
	GL11.glScalef(radius * 2, 5, radius * 2);
	NGTOBuilderUtilClient.enableAlpha(0.25);
	GL11.glDepthMask(false);
	(isMelting ? rangeErase : range).render(renderer);
	NGTOBuilderUtilClient.disableAlpha();
	GL11.glPopMatrix();
}

function render(
	entity: EntityVehicle,
	pass: number,
	partialTicks: number,
): void {
	if (!entity) {
		body.render(renderer);
		return;
	}
	ensureBrushDefaults(entity);
	const dataMap = entity.getResourceState().getDataMap();
	const world = RTMApiCompat.getWorld(entity);
	const player = MCWrapperClient.getPlayer();
	const hostId = dataMap.getString("hostPlayerEntityId");
	const host =
		hostId === ""
			? null
			: (world.getEntityByID(Number(hostId)) as unknown as EntityPlayer);
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
		NGTLog.sendChatMessage(
			host as unknown as ICommandSender,
			keyManager.getDescription("showHelp"),
		);
	}
	const serverVersion = dataMap.getString("VERSIONS");
	if (
		serverVersion !== "" &&
		serverVersion !== Version &&
		!dataMap.getBoolean("isVersionChecked")
	) {
		dataMap.setBoolean("isVersionChecked", true, 0);
		NGTLog.sendChatMessage(
			host as unknown as ICommandSender,
			`§cVersions don't match! Client: ${Version}, Server: ${serverVersion}`,
		);
	}
	if (
		NGTUtilClient.getMinecraft().currentScreen === null &&
		pass === 0 &&
		renderer.currentMatId === 0
	)
		keyInput(host, entity, partialTicks, right, left, prevRight, prevLeft);
	body.render(renderer);
	renderRange(entity, partialTicks, left);
}
