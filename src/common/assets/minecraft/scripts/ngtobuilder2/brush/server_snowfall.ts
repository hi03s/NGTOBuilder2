import { BlockSet } from "jp.ngt.ngtlib.block";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ScriptExecuter } from "jp.ngt.rtm.modelpack";
import { WeakHashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { EntityPlayer } from "net.minecraft.entity.player";
import { World } from "net.minecraft.world";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { BlockBuilder } from "../../lib_hi03toolkit_1_0/lib_BlockBuilder";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { UndoManager } from "../../lib_hi03toolkit_1_0/lib_UndoManager";

Version = "2.3";

export type BrushSnowfallRequest = {
	id: number;
	action: "accumulate" | "melt" | "mound" | "smooth";
	centerX: number;
	centerZ: number;
	radius: number;
	density: number;
	seed: number;
	maxThickness: number;
	increment: number;
	biomeFill: boolean;
};

type BiomeBackup = {
	x: number;
	z: number;
	biomeId: number;
};

type SnowStack = {
	baseY: number;
	units: number;
};

type SmoothColumn = {
	baseY: number;
	units: number;
	surfaceUnits: number;
};

let builder: BlockBuilder;
const BUILD_LIMIT = 5000;
const DEFAULT_RADIUS = 16;
const DEFAULT_DENSITY = 30;
const DEFAULT_MAX_THICKNESS = 2;
const DEFAULT_INCREMENT = 1;
const MAX_THICKNESS = 24;
const BRUSH_SETTINGS_VERSION = 2;

function ensureBrushDefaults(entity: EntityVehicle): void {
	const dataMap = entity.getResourceState().getDataMap();
	if (dataMap.getInt("snowfallSettingsVersion") === BRUSH_SETTINGS_VERSION)
		return;
	dataMap.setInt("snowfallRadius", DEFAULT_RADIUS, 1);
	dataMap.setInt("snowfallDensity", DEFAULT_DENSITY, 1);
	dataMap.setInt("snowfallMaxThickness", DEFAULT_MAX_THICKNESS, 1);
	dataMap.setInt("snowfallIncrement", DEFAULT_INCREMENT, 1);
	dataMap.setBoolean("snowfallBiomeFill", false, 1);
	dataMap.setInt("snowfallSettingsVersion", BRUSH_SETTINGS_VERSION, 1);
}

function init(entity: EntityVehicle, scriptExecuter: ScriptExecuter): void {
	const dataMap = entity.getResourceState().getDataMap();
	ensureBrushDefaults(entity);
	if (dataMap.getBoolean("isInitializedServer")) return;
	dataMap.setBoolean("isInitializedServer", true, 1);
	builder = builderHashMap.get(entity);
	if (!builder) {
		builder = new BlockBuilder();
		builderHashMap.put(entity, builder);
	} else {
		builder.clear(entity);
	}
	if (!biomeUndoMap.get(entity)) biomeUndoMap.put(entity, []);
	dataMap.setInt("lastSnowfallRequestId", -1, 0);
	dataMap.setBoolean("isBuilding", false, 1);
}

function imul(a: number, b: number): number {
	const ah = (a >>> 16) & 0xffff;
	const al = a & 0xffff;
	const bh = (b >>> 16) & 0xffff;
	const bl = b & 0xffff;
	return (al * bl + ((ah * bl + al * bh) << 16)) | 0;
}

function mix32(value: number): number {
	value = Math.floor(value) | 0;
	value = imul(value ^ (value >>> 16), 0x45d9f3b);
	value = imul(value ^ (value >>> 16), 0x45d9f3b);
	return (value ^ (value >>> 16)) >>> 0;
}

function randomAt(
	seed: number,
	x: number,
	z: number,
	salt: number = 0,
): number {
	return (
		mix32(
			(seed | 0) ^
				imul(x | 0, 0x1f123bb5) ^
				imul(z | 0, 0x5f356495) ^
				imul(salt | 0, 0x6c8e9cf5),
		) / 4294967296
	);
}

function getTopSurfaceY(world: World, x: number, z: number): number {
	const air = RTMApiCompat.getBlockAir();
	for (let y = 255; y >= 0; y--) {
		const block = RTMApiCompat.getBlock(world, x, y, z);
		if (block && block !== air) return y + 1;
	}
	return 0;
}

function getLeafIgnoringSurfaceY(world: World, x: number, z: number): number {
	const air = RTMApiCompat.getBlockAir();
	for (let y = 255; y >= 0; y--) {
		const block = RTMApiCompat.getBlock(world, x, y, z);
		if (!block || block === air || RTMApiCompat.isLeaves(world, x, y, z))
			continue;
		if (isSnowBlock(block)) {
			const surfaceY = y + 1;
			while (y >= 0 && isSnowBlock(RTMApiCompat.getBlock(world, x, y, z)))
				y--;
			if (y >= 0 && RTMApiCompat.isLeaves(world, x, y, z)) continue;
			return surfaceY;
		}
		return y + 1;
	}
	return 0;
}

function isSnowBlock(block: unknown): boolean {
	return (
		block === RTMApiCompat.getBlockSnowLayer() ||
		block === RTMApiCompat.getBlockSnow()
	);
}

function readSnowStackBelowSurface(
	world: World,
	x: number,
	surfaceY: number,
	z: number,
): SnowStack {
	let baseY = surfaceY;
	let y = surfaceY - 1;
	if (y < 0 || !isSnowBlock(RTMApiCompat.getBlock(world, x, y, z)))
		return { baseY: baseY, units: 0 };
	while (y >= 0 && isSnowBlock(RTMApiCompat.getBlock(world, x, y, z))) y--;
	baseY = y + 1;
	let units = 0;
	for (y = baseY; y <= 255; y++) {
		const block = RTMApiCompat.getBlock(world, x, y, z);
		if (block === RTMApiCompat.getBlockSnow()) {
			units += 8;
			continue;
		}
		if (block === RTMApiCompat.getBlockSnowLayer()) {
			const metadata = RTMApiCompat.getMetadata(world, x, y, z);
			units += (metadata === null ? 0 : metadata) + 1;
		}
		break;
	}
	return { baseY: baseY, units: units };
}

function getHighestSnowStack(
	world: World,
	x: number,
	z: number,
): SnowStack | null {
	for (let y = 255; y >= 0; y--)
		if (isSnowBlock(RTMApiCompat.getBlock(world, x, y, z)))
			return readSnowStackBelowSurface(world, x, y + 1, z);
	return null;
}

function queueSnowThickness(
	entity: EntityVehicle,
	action: BlockBuilder,
	x: number,
	surfaceY: number,
	z: number,
	targetUnits: number,
): boolean {
	if (surfaceY <= 0 || surfaceY > 256) return false;
	const world = RTMApiCompat.getWorld(entity);
	const air = RTMApiCompat.getBlockAir();
	const snowLayer = RTMApiCompat.getBlockSnowLayer();
	const snowBlock = RTMApiCompat.getBlockSnow();
	const stack = readSnowStackBelowSurface(world, x, surfaceY, z);
	const baseY = stack.baseY;
	targetUnits = Math.max(0, Math.min(targetUnits, (256 - baseY) * 8));
	if (targetUnits > 0 && stack.units === 0) {
		if (RTMApiCompat.getBlock(world, x, baseY, z) !== air) return false;
		if (!RTMApiCompat.canPlaceSnow(world, x, baseY, z)) return false;
	}
	const requestedLevels = Math.ceil(targetUnits / 8);
	for (let level = 0; level < requestedLevels; level++) {
		const y = baseY + level;
		const current = RTMApiCompat.getBlock(world, x, y, z);
		if (isSnowBlock(current) || current === air) continue;
		targetUnits = Math.min(targetUnits, level * 8);
		break;
	}
	if (targetUnits === stack.units) return false;
	const oldLevels = Math.ceil(stack.units / 8);
	const newLevels = Math.ceil(targetUnits / 8);
	const levels = Math.max(oldLevels, newLevels);
	for (let level = 0; level < levels; level++) {
		const y = baseY + level;
		const fullBlocks = Math.floor(targetUnits / 8);
		const remainder = targetUnits % 8;
		let targetBlock = air;
		let targetMetadata = 0;
		if (level < fullBlocks) targetBlock = snowBlock;
		else if (level === fullBlocks && remainder > 0) {
			targetBlock = snowLayer;
			targetMetadata = remainder - 1;
		}
		const currentBlock = RTMApiCompat.getBlock(world, x, y, z);
		const currentMetadata = RTMApiCompat.getMetadata(world, x, y, z);
		if (currentBlock === targetBlock && currentMetadata === targetMetadata)
			continue;
		action.add(entity, new BlockSet(targetBlock, targetMetadata), x, y, z);
	}
	return true;
}

function randomIncrease(
	request: BrushSnowfallRequest,
	x: number,
	z: number,
	salt: number,
): number {
	const minimum = Math.max(1, request.increment - 2);
	const range = request.increment - minimum + 1;
	return minimum + Math.floor(randomAt(request.seed, x, z, salt) * range);
}

function increaseSnowAtSurface(
	entity: EntityVehicle,
	action: BlockBuilder,
	request: BrushSnowfallRequest,
	x: number,
	surfaceY: number,
	z: number,
	increase: number,
): boolean {
	const stack = readSnowStackBelowSurface(
		RTMApiCompat.getWorld(entity),
		x,
		surfaceY,
		z,
	);
	if (stack.units >= request.maxThickness) return false;
	return queueSnowThickness(
		entity,
		action,
		x,
		surfaceY,
		z,
		Math.min(request.maxThickness, stack.units + Math.max(1, increase)),
	);
}

function markChunk(
	chunks: { [key: string]: [number, number] },
	x: number,
	z: number,
): void {
	const chunkX = Math.floor(x) >> 4;
	const chunkZ = Math.floor(z) >> 4;
	chunks[`${chunkX},${chunkZ}`] = [chunkX, chunkZ];
}

function syncChunks(
	entity: EntityVehicle,
	chunks: { [key: string]: [number, number] },
): void {
	const world = RTMApiCompat.getWorld(entity);
	Object.keys(chunks).forEach((key) => {
		const pos = chunks[key];
		RTMApiCompat.syncBiomeChunk(world, pos[0], pos[1]);
	});
}

function setBiome(
	entity: EntityVehicle,
	x: number,
	z: number,
	biomeId: number,
	backups: BiomeBackup[],
	chunks: { [key: string]: [number, number] },
): void {
	const world = RTMApiCompat.getWorld(entity);
	const previous = RTMApiCompat.getBiomeId(world, x, z);
	if (previous === biomeId) return;
	backups.push({ x: x, z: z, biomeId: previous });
	RTMApiCompat.setBiomeId(world, x, z, biomeId);
	markChunk(chunks, x, z);
}

function appendAction(
	entity: EntityVehicle,
	action: BlockBuilder,
	biomeBackups: BiomeBackup[],
	changedChunks: { [key: string]: [number, number] },
): void {
	const placements = action.get(entity);
	if (placements.length === 0 && biomeBackups.length === 0) return;
	UndoManager.backupFromBlockBuilder(entity, action);
	const undoList = biomeUndoMap.get(entity) || [];
	undoList.push(biomeBackups);
	biomeUndoMap.put(entity, undoList);
	const queued = builder.get(entity);
	for (let i = 0; i < placements.length; i++) queued.push(placements[i]);
	builder.set(entity, queued);
	syncChunks(entity, changedChunks);
}

function forEachColumn(
	request: BrushSnowfallRequest,
	callback: (x: number, z: number) => void,
): void {
	const radiusSq = request.radius * request.radius;
	for (
		let x = request.centerX - request.radius;
		x <= request.centerX + request.radius;
		x++
	) {
		for (
			let z = request.centerZ - request.radius;
			z <= request.centerZ + request.radius;
			z++
		) {
			const dx = x - request.centerX;
			const dz = z - request.centerZ;
			if (dx * dx + dz * dz <= radiusSq) callback(x, z);
		}
	}
}

function fillBiomeInRange(
	entity: EntityVehicle,
	request: BrushSnowfallRequest,
	biomeId: number,
	backups: BiomeBackup[],
	chunks: { [key: string]: [number, number] },
): void {
	forEachColumn(request, (x, z) =>
		setBiome(entity, x, z, biomeId, backups, chunks),
	);
}

function accumulateSnow(
	entity: EntityVehicle,
	request: BrushSnowfallRequest,
): void {
	const world = RTMApiCompat.getWorld(entity);
	const action = new BlockBuilder();
	const biomeBackups: BiomeBackup[] = [];
	const changedChunks: { [key: string]: [number, number] } = {};
	const snowyBiome = RTMApiCompat.getSnowyBiomeId();
	if (request.biomeFill)
		fillBiomeInRange(
			entity,
			request,
			snowyBiome,
			biomeBackups,
			changedChunks,
		);
	forEachColumn(request, (x, z) => {
		if (randomAt(request.seed, x, z) >= request.density / 100) return;
		const topY = getTopSurfaceY(world, x, z);
		const groundY = getLeafIgnoringSurfaceY(world, x, z);
		let placed = increaseSnowAtSurface(
			entity,
			action,
			request,
			x,
			topY,
			z,
			randomIncrease(request, x, z, 1),
		);
		if (groundY !== topY)
			placed =
				increaseSnowAtSurface(
					entity,
					action,
					request,
					x,
					groundY,
					z,
					randomIncrease(request, x, z, 2),
				) || placed;
		if (placed && !request.biomeFill)
			setBiome(entity, x, z, snowyBiome, biomeBackups, changedChunks);
	});
	appendAction(entity, action, biomeBackups, changedChunks);
}

function meltSnow(entity: EntityVehicle, request: BrushSnowfallRequest): void {
	const world = RTMApiCompat.getWorld(entity);
	const action = new BlockBuilder();
	const air = new BlockSet(RTMApiCompat.getBlockAir(), 0);
	const snowLayer = RTMApiCompat.getBlockSnowLayer();
	const snowBlock = RTMApiCompat.getBlockSnow();
	const biomeBackups: BiomeBackup[] = [];
	const changedChunks: { [key: string]: [number, number] } = {};
	const plainsBiome = RTMApiCompat.getPlainsBiomeId();
	forEachColumn(request, (x, z) => {
		for (let y = 0; y <= 255; y++)
			if (
				RTMApiCompat.getBlock(world, x, y, z) === snowLayer ||
				RTMApiCompat.getBlock(world, x, y, z) === snowBlock
			)
				action.add(entity, air, x, y, z);
		setBiome(entity, x, z, plainsBiome, biomeBackups, changedChunks);
	});
	appendAction(entity, action, biomeBackups, changedChunks);
}

function moundSnow(entity: EntityVehicle, request: BrushSnowfallRequest): void {
	const world = RTMApiCompat.getWorld(entity);
	const action = new BlockBuilder();
	const biomeBackups: BiomeBackup[] = [];
	const changedChunks: { [key: string]: [number, number] } = {};
	const snowyBiome = RTMApiCompat.getSnowyBiomeId();
	if (request.biomeFill)
		fillBiomeInRange(
			entity,
			request,
			snowyBiome,
			biomeBackups,
			changedChunks,
		);
	forEachColumn(request, (x, z) => {
		const dx = x - request.centerX;
		const dz = z - request.centerZ;
		const distance = Math.sqrt(dx * dx + dz * dz);
		const increase = Math.ceil(
			randomIncrease(request, x, z, 3) * (1 - distance / request.radius),
		);
		if (increase <= 0) return;
		const topY = getTopSurfaceY(world, x, z);
		const groundY = getLeafIgnoringSurfaceY(world, x, z);
		let placed = increaseSnowAtSurface(
			entity,
			action,
			request,
			x,
			topY,
			z,
			increase,
		);
		if (groundY !== topY)
			placed =
				increaseSnowAtSurface(
					entity,
					action,
					request,
					x,
					groundY,
					z,
					increase,
				) || placed;
		if (placed && !request.biomeFill)
			setBiome(entity, x, z, snowyBiome, biomeBackups, changedChunks);
	});
	appendAction(entity, action, biomeBackups, changedChunks);
}

function smoothSnow(
	entity: EntityVehicle,
	request: BrushSnowfallRequest,
): void {
	const world = RTMApiCompat.getWorld(entity);
	const action = new BlockBuilder();
	const biomeBackups: BiomeBackup[] = [];
	const changedChunks: { [key: string]: [number, number] } = {};
	const snapshot: { [key: string]: SmoothColumn } = {};
	for (
		let x = request.centerX - request.radius - 1;
		x <= request.centerX + request.radius + 1;
		x++
	)
		for (
			let z = request.centerZ - request.radius - 1;
			z <= request.centerZ + request.radius + 1;
			z++
		) {
			const stack = getHighestSnowStack(world, x, z);
			const baseY = stack ? stack.baseY : getTopSurfaceY(world, x, z);
			const units = stack ? stack.units : 0;
			snapshot[`${x},${z}`] = {
				baseY: baseY,
				units: units,
				surfaceUnits: baseY * 8 + units,
			};
		}
	forEachColumn(request, (x, z) => {
		const current = snapshot[`${x},${z}`];
		let total = 0;
		for (let nx = x - 1; nx <= x + 1; nx++)
			for (let nz = z - 1; nz <= z + 1; nz++)
				total += snapshot[`${nx},${nz}`].surfaceUnits;
		const targetSurface = Math.round(total / 9);
		const targetThickness = Math.max(0, targetSurface - current.baseY * 8);
		if (targetThickness !== current.units)
			queueSnowThickness(
				entity,
				action,
				x,
				current.baseY + Math.ceil(current.units / 8),
				z,
				targetThickness,
			);
	});
	appendAction(entity, action, biomeBackups, changedChunks);
}

function processRequest(entity: EntityVehicle): void {
	const dataMap = entity.getResourceState().getDataMap();
	const request = NGTOBuilderUtil.getJsonData<BrushSnowfallRequest>(
		dataMap,
		"snowfallRequest",
	);
	if (!request || request.id === dataMap.getInt("lastSnowfallRequestId"))
		return;
	dataMap.setInt("lastSnowfallRequestId", request.id, 0);
	request.radius = Math.max(1, Math.min(64, Math.floor(request.radius)));
	request.density = Math.max(0, Math.min(100, Math.floor(request.density)));
	request.maxThickness = Math.max(
		1,
		Math.min(MAX_THICKNESS, Math.floor(request.maxThickness)),
	);
	request.increment = Math.max(
		1,
		Math.min(MAX_THICKNESS, Math.floor(request.increment)),
	);
	request.biomeFill = request.biomeFill === true;
	request.centerX = Math.floor(request.centerX);
	request.centerZ = Math.floor(request.centerZ);
	if (request.action === "accumulate") accumulateSnow(entity, request);
	else if (request.action === "melt") meltSnow(entity, request);
	else if (request.action === "mound") moundSnow(entity, request);
	else if (request.action === "smooth") smoothSnow(entity, request);
	dataMap.setBoolean("canUndo", UndoManager.canUndo(entity), 1);
}

function restoreLastBiomes(entity: EntityVehicle): void {
	const undoList = biomeUndoMap.get(entity) || [];
	if (undoList.length === 0) return;
	const backups = undoList[undoList.length - 1];
	const world = RTMApiCompat.getWorld(entity);
	const chunks: { [key: string]: [number, number] } = {};
	for (let i = 0; i < backups.length; i++) {
		const backup = backups[i];
		RTMApiCompat.setBiomeId(world, backup.x, backup.z, backup.biomeId);
		markChunk(chunks, backup.x, backup.z);
	}
	syncChunks(entity, chunks);
}

function finishBiomeUndo(entity: EntityVehicle): void {
	const undoList = biomeUndoMap.get(entity) || [];
	undoList.pop();
	biomeUndoMap.put(entity, undoList);
}

function onUpdate2(
	entity: EntityVehicle,
	scriptExecuter: ScriptExecuter,
): void {
	const dataMap = entity.getResourceState().getDataMap();
	builder = builderHashMap.get(entity);
	if (!builder) return;
	if (dataMap.getBoolean("isEndEdit")) {
		entity.setDead();
		return;
	}
	processRequest(entity);
	if (!builder.isFinished(entity)) {
		dataMap.setBoolean("isBuilding", true, 1);
		builder.doBuild(entity, BUILD_LIMIT);
	}
	if (builder.isFinished(entity)) dataMap.setBoolean("isBuilding", false, 1);
	if (dataMap.getBoolean("isUndo") && builder.isFinished(entity)) {
		const undo = UndoManager.getLastData(entity);
		if (undo) {
			if (!dataMap.getBoolean("snowfallUndoBiomeApplied")) {
				restoreLastBiomes(entity);
				dataMap.setBoolean("snowfallUndoBiomeApplied", true, 0);
			}
			undo.doBuild(entity, BUILD_LIMIT);
			if (undo.isFinished(entity)) {
				UndoManager.pop(entity);
				finishBiomeUndo(entity);
				dataMap.setBoolean("snowfallUndoBiomeApplied", false, 0);
				dataMap.setBoolean("isUndo", false, 1);
			}
		} else {
			dataMap.setBoolean("snowfallUndoBiomeApplied", false, 0);
			dataMap.setBoolean("isUndo", false, 1);
		}
		dataMap.setBoolean("canUndo", UndoManager.canUndo(entity), 1);
	}
}

var hostPlayerList: WeakHashMap<Entity, EntityPlayer>;
var builderHashMap: WeakHashMap<Entity, BlockBuilder>;
var biomeUndoMap: WeakHashMap<Entity, BiomeBackup[][]>;
var Version: string;
hostPlayerList = new WeakHashMap();
builderHashMap = new WeakHashMap();
biomeUndoMap = new WeakHashMap();

function onUpdate(entity: EntityVehicle, scriptExecuter: ScriptExecuter): void {
	entity.rotationYaw = 0;
	const dataMap = entity.getResourceState().getDataMap();
	const hostPlayer = hostPlayerList.get(entity);
	const rider = RTMApiCompat.getRider(entity) as unknown as EntityPlayer;
	const ridingEntity = RTMApiCompat.getRidingEntity(entity);
	if (dataMap.getString("VERSIONS") === "")
		dataMap.setString("VERSIONS", Version, 1);
	RTMApiCompat.doFollowing(entity, hostPlayer);
	if (!hostPlayer) {
		init(entity, scriptExecuter);
		let player: EntityPlayer | null = null;
		if (rider) player = rider;
		else if (ridingEntity instanceof EntityPlayer) player = ridingEntity;
		if (player) {
			hostPlayerList.put(entity, player);
			dataMap.setString(
				"hostPlayerEntityId",
				String(player.getEntityId()),
				1,
			);
			if (rider) {
				RTMApiCompat.dismountPlayer(entity);
				RTMApiCompat.startRiding(entity, rider);
			}
		}
	} else if (rider) {
		RTMApiCompat.dismountPlayer(entity);
		dataMap.setBoolean("isEndEdit", true, 1);
	} else {
		if (dataMap.getBoolean("isInitializedServer"))
			dataMap.setBoolean("isInitializedServer", false, 1);
		onUpdate2(entity, scriptExecuter);
	}
}
