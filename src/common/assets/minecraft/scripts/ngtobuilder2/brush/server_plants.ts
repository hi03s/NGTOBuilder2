import { BlockSet } from "jp.ngt.ngtlib.block";
import { EntityVehicle } from "jp.ngt.rtm.entity.vehicle";
import { ScriptExecuter } from "jp.ngt.rtm.modelpack";
import { WeakHashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { EntityPlayer } from "net.minecraft.entity.player";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import {
	BlockBuilder,
	BlockSetPlacement,
} from "../../lib_hi03toolkit_1_0/lib_BlockBuilder";
import { NGTOBuilderUtil } from "../../lib_hi03toolkit_1_0/lib_NGTOBuilderUtil";
import { UndoManager } from "../../lib_hi03toolkit_1_0/lib_UndoManager";
import { RotatableBlockObjectMapper } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObjectMapper";
import {
	blockSetKey,
	createTallPlantsObject,
	createPlantsCandidates,
	getEraseGroundY,
	getPresetBlockKeys,
	getSurfaceY,
	getPlantsPresetById,
	getPlantsPresetSignature,
	isValidPlantsGround,
} from "./plants_common";

Version = "2.5";

export type BrushPlantsRequest = {
	id: number;
	action: "generate" | "erase";
	centerX: number;
	centerZ: number;
	radius: number;
	density: number;
	seed: number;
	presetId: string;
};

let builder: BlockBuilder;
const BUILD_LIMIT = 5000;
const DEFAULT_RADIUS = 16;
const DEFAULT_DENSITY = 10;
const BRUSH_SETTINGS_VERSION = 1;

function ensureBrushDefaults(entity: EntityVehicle): void {
	const dataMap = entity.getResourceState().getDataMap();
	if (dataMap.getInt("brushSettingsVersion") === BRUSH_SETTINGS_VERSION)
		return;
	dataMap.setInt("brushRadius", DEFAULT_RADIUS, 1);
	dataMap.setInt("brushDensity", DEFAULT_DENSITY, 1);
	dataMap.setInt("plantsPresetIndex", 0, 1);
	dataMap.setInt("brushSettingsVersion", BRUSH_SETTINGS_VERSION, 1);
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
	dataMap.setInt("lastBrushRequestId", -1, 0);
	dataMap.setBoolean("isBuilding", false, 1);
	dataMap.setString("plantsPresetSignature", getPlantsPresetSignature(), 1);
}

function appendAction(entity: EntityVehicle, action: BlockBuilder): void {
	const placements = action.get(entity);
	if (placements.length === 0) return;
	UndoManager.backupFromBlockBuilder(entity, action);
	const queued = builder.get(entity);
	for (let i = 0; i < placements.length; i++) queued.push(placements[i]);
	builder.set(entity, queued);
}

function placementKey(placement: BlockSetPlacement): string {
	return `${Math.floor(placement[1])},${Math.floor(placement[2])},${Math.floor(placement[3])}`;
}

function generatePlants(
	entity: EntityVehicle,
	request: BrushPlantsRequest,
): void {
	const preset = getPlantsPresetById(request.presetId);
	if (!preset) return;
	const world = RTMApiCompat.getWorld(entity);
	const action = new BlockBuilder();
	const reservedPositions: { [key: string]: boolean } = {};
	const candidates = createPlantsCandidates(
		request.centerX,
		request.centerZ,
		request.radius,
		request.density,
		request.seed,
		preset.ngtoList.length,
		preset.randomHeight,
	);
	for (let i = 0; i < candidates.length; i++) {
		const candidate = candidates[i];
		const ngto = preset.ngtoList[candidate.ngtoIndex];
		if (!ngto) continue;
		const plants = createTallPlantsObject(ngto, candidate.extraHeight);
		const centerX = Math.floor(ngto.xSize / 2) + 0.5;
		const centerZ = Math.floor(ngto.zSize / 2) + 0.5;
		plants.setPivot(centerX, 0.5, centerZ);
		plants.rotate(candidate.yaw, 0, 0);
		plants.movePivotToBaseXZ();
		RotatableBlockObjectMapper.toBlockCoordSelf(plants);
		const y = getSurfaceY(world, candidate.x, candidate.z);
		if (!isValidPlantsGround(world, candidate.x, y, candidate.z)) continue;
		const placements = RotatableBlockObjectMapper.toBlockPlacements(
			plants,
			candidate.x,
			y,
			candidate.z,
		);
		const nonOverlapping: BlockSetPlacement[] = [];
		for (let j = 0; j < placements.length; j++) {
			const placement = placements[j];
			if (!placement || reservedPositions[placementKey(placement)])
				continue;
			nonOverlapping.push(placement);
		}
		const previousCount = action.get(entity).length;
		action.addFromRotatableBlockObjectAt(entity, nonOverlapping, true);
		const queued = action.get(entity);
		// ワールドの空気判定を通り、実際に追加された座標だけを後続NGTOから保護する。
		for (let j = previousCount; j < queued.length; j++)
			reservedPositions[placementKey(queued[j])] = true;
	}
	appendAction(entity, action);
}

function erasePlants(entity: EntityVehicle, request: BrushPlantsRequest): void {
	const preset = getPlantsPresetById(request.presetId);
	if (!preset) return;
	const world = RTMApiCompat.getWorld(entity);
	const targetKeys = getPresetBlockKeys(preset);
	const action = new BlockBuilder();
	const air = new BlockSet(RTMApiCompat.getBlockAir(), 0);
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
			if (dx * dx + dz * dz > radiusSq) continue;
			const groundY = getEraseGroundY(world, x, z, targetKeys);
			for (let y = groundY + 1; y <= 255; y++) {
				const block = RTMApiCompat.getBlock(world, x, y, z);
				const metadata = RTMApiCompat.getMetadata(world, x, y, z);
				if (!block || metadata === null) continue;
				const key = blockSetKey(new BlockSet(block, metadata));
				if (targetKeys[key]) action.add(entity, air, x, y, z);
			}
		}
	}
	appendAction(entity, action);
}

function processRequest(entity: EntityVehicle): void {
	const dataMap = entity.getResourceState().getDataMap();
	const request = NGTOBuilderUtil.getJsonData<BrushPlantsRequest>(
		dataMap,
		"brushRequest",
	);
	if (!request || request.id === dataMap.getInt("lastBrushRequestId")) return;
	dataMap.setInt("lastBrushRequestId", request.id, 0);
	request.radius = Math.max(1, Math.min(64, Math.floor(request.radius)));
	request.density = Math.max(0, Math.min(100, Math.floor(request.density)));
	request.centerX = Math.floor(request.centerX);
	request.centerZ = Math.floor(request.centerZ);
	if (request.action === "generate") generatePlants(entity, request);
	else if (request.action === "erase") erasePlants(entity, request);
	dataMap.setBoolean("canUndo", UndoManager.canUndo(entity), 1);
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
			undo.doBuild(entity, BUILD_LIMIT);
			if (undo.isFinished(entity)) {
				UndoManager.pop(entity);
				dataMap.setBoolean("isUndo", false, 1);
			}
		} else {
			dataMap.setBoolean("isUndo", false, 1);
		}
		dataMap.setBoolean("canUndo", UndoManager.canUndo(entity), 1);
	}
}

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
