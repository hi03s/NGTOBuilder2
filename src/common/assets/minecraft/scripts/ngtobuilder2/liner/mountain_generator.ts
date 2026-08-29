export type RidgeNode = {
	x: number;
	z: number;
	height: number;
	width: number;
};

export type MountainHeightMap = {
	originX: number;
	originZ: number;
	values: number[][];
};

export type MountainMaterial = "grass" | "dirt" | "stone";

export type MountainBlock = [
	x: number,
	y: number,
	z: number,
	material: MountainMaterial,
];

export type MountainDecorationMaterial =
	"log" | "leaves" | "tallgrass" | "yellowFlower" | "redFlower";

export type MountainDecoration = [
	x: number,
	y: number,
	z: number,
	material: MountainDecorationMaterial,
	metadata: number,
];

export type MountainSurfaceTriangle = [
	[number, number, number],
	[number, number, number],
	[number, number, number],
];

export function lerp(a: number, b: number, rate: number): number {
	return a + (b - a) * rate;
}

export function createHeightMap(width: number, depth: number): number[][] {
	const heightMap: number[][] = [];
	for (let x = 0; x < width; x++) {
		const column: number[] = [];
		for (let z = 0; z < depth; z++) column.push(0);
		heightMap.push(column);
	}
	return heightMap;
}

/** Burns one straight ridge segment into a height map using a triangular profile. */
export function applyRidgeSegment(
	heightMap: number[][],
	a: RidgeNode,
	b: RidgeNode,
): void {
	if (heightMap.length === 0 || heightMap[0].length === 0) return;
	const mapWidth = heightMap.length;
	const mapDepth = heightMap[0].length;
	const abx = b.x - a.x;
	const abz = b.z - a.z;
	const abLenSq = abx * abx + abz * abz;

	for (let x = 0; x < mapWidth; x++) {
		for (let z = 0; z < mapDepth; z++) {
			const apx = x - a.x;
			const apz = z - a.z;
			let rate = 0;
			if (abLenSq > 0) rate = (apx * abx + apz * abz) / abLenSq;
			rate = Math.max(0, Math.min(1, rate));

			const qx = a.x + abx * rate;
			const qz = a.z + abz * rate;
			const dx = x - qx;
			const dz = z - qz;
			const distance = Math.sqrt(dx * dx + dz * dz);
			const ridgeHeight = lerp(a.height, b.height, rate);
			const ridgeWidth = lerp(a.width, b.width, rate);
			if (ridgeWidth <= 0) continue;
			const distanceRate = distance / ridgeWidth;
			if (distanceRate >= 1) continue;
			const candidateHeight = ridgeHeight * (1 - distanceRate);
			heightMap[x][z] = Math.max(heightMap[x][z], candidateHeight);
		}
	}
}

/** Creates the smallest map that contains the whole influence area of A-B. */
export function createRidgeHeightMap(
	a: RidgeNode,
	b: RidgeNode,
): MountainHeightMap {
	const margin = Math.ceil(Math.max(a.width, b.width));
	const originX = Math.floor(Math.min(a.x, b.x)) - margin;
	const originZ = Math.floor(Math.min(a.z, b.z)) - margin;
	const maxX = Math.ceil(Math.max(a.x, b.x)) + margin;
	const maxZ = Math.ceil(Math.max(a.z, b.z)) + margin;
	const values = createHeightMap(maxX - originX + 1, maxZ - originZ + 1);
	applyRidgeSegment(
		values,
		{
			x: a.x - originX,
			z: a.z - originZ,
			height: a.height,
			width: a.width,
		},
		{
			x: b.x - originX,
			z: b.z - originZ,
			height: b.height,
			width: b.width,
		},
	);
	return { originX: originX, originZ: originZ, values: values };
}

/** Converts height columns to grass (top), dirt (3 layers), and stone blocks. */
export function heightMapToBlocks(
	heightMap: MountainHeightMap,
	baseY: number,
	blockLimit: number = Number.POSITIVE_INFINITY,
): MountainBlock[] {
	const blocks: MountainBlock[] = [];
	for (let x = 0; x < heightMap.values.length; x++) {
		for (let z = 0; z < heightMap.values[x].length; z++) {
			const height = Math.floor(heightMap.values[x][z]);
			if (height <= 0) continue;
			for (let y = 0; y <= height; y++) {
				let material: MountainMaterial = "stone";
				if (y === height) material = "grass";
				else if (y >= height - 3) material = "dirt";
				blocks.push([
					heightMap.originX + x,
					baseY + y,
					heightMap.originZ + z,
					material,
				]);
				if (blocks.length > blockLimit) return blocks;
			}
		}
	}
	return blocks;
}

export function generateMountainBlocks(
	a: RidgeNode,
	b: RidgeNode,
	baseY: number,
	blockLimit: number = Number.POSITIVE_INFINITY,
): MountainBlock[] {
	return heightMapToBlocks(createRidgeHeightMap(a, b), baseY, blockLimit);
}

/** Returns only the top of each column for a lightweight client preview. */
export function generateMountainSurfacePositions(
	a: RidgeNode,
	b: RidgeNode,
	baseY: number,
): [number, number, number][] {
	const heightMap = createRidgeHeightMap(a, b);
	const positions: [number, number, number][] = [];
	for (let x = 0; x < heightMap.values.length; x++) {
		for (let z = 0; z < heightMap.values[x].length; z++) {
			const height = Math.floor(heightMap.values[x][z]);
			if (height <= 0) continue;
			positions.push([
				heightMap.originX + x,
				baseY + height,
				heightMap.originZ + z,
			]);
		}
	}
	return positions;
}

/** Builds a capped-size triangle mesh from the height map for client preview. */
export function generateMountainSurfaceTriangles(
	a: RidgeNode,
	b: RidgeNode,
	baseY: number,
): MountainSurfaceTriangle[] {
	const heightMap = createRidgeHeightMap(a, b);
	const values = heightMap.values;
	const area = values.length * values[0].length;
	const step = Math.max(1, Math.ceil(Math.sqrt(area / 20000)));
	const triangles: MountainSurfaceTriangle[] = [];
	for (let x = 0; x + step < values.length; x += step) {
		for (let z = 0; z + step < values[x].length; z += step) {
			const h00 = values[x][z];
			const h10 = values[x + step][z];
			const h01 = values[x][z + step];
			const h11 = values[x + step][z + step];
			if (Math.min(h00, h10, h01, h11) <= 0) continue;
			const x0 = heightMap.originX + x;
			const x1 = x0 + step;
			const z0 = heightMap.originZ + z;
			const z1 = z0 + step;
			const p00: [number, number, number] = [x0, baseY + h00 + 0.02, z0];
			const p10: [number, number, number] = [x1, baseY + h10 + 0.02, z0];
			const p01: [number, number, number] = [x0, baseY + h01 + 0.02, z1];
			const p11: [number, number, number] = [x1, baseY + h11 + 0.02, z1];
			triangles.push([p00, p10, p11]);
			triangles.push([p00, p11, p01]);
		}
	}
	return triangles;
}

function mountainHash(x: number, z: number, salt: number): number {
	const value =
		Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
	return value - Math.floor(value);
}

function addTree(
	decorations: MountainDecoration[],
	x: number,
	y: number,
	z: number,
	species: number,
): void {
	const isSpruce = species === 1;
	const trunkHeight =
		(isSpruce ? 6 : species === 2 ? 5 : 4) +
		Math.floor(mountainHash(x, z, 11) * 2);
	for (let dy = 0; dy < trunkHeight; dy++) {
		decorations.push([x, y + dy, z, "log", species]);
	}
	if (isSpruce) {
		for (let layer = -4; layer <= 1; layer++) {
			const radius = layer <= -3 ? 2 : layer <= -1 ? 1 : 0;
			for (let dx = -radius; dx <= radius; dx++) {
				for (let dz = -radius; dz <= radius; dz++) {
					if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
					if (dx === 0 && dz === 0 && layer <= 0) continue;
					decorations.push([
						x + dx,
						y + trunkHeight - 1 + layer,
						z + dz,
						"leaves",
						species | 4,
					]);
				}
			}
		}
		return;
	}
	for (let layer = -2; layer <= 1; layer++) {
		const radius = layer === 1 ? 1 : 2;
		for (let dx = -radius; dx <= radius; dx++) {
			for (let dz = -radius; dz <= radius; dz++) {
				if (dx * dx + dz * dz > radius * radius + 1) continue;
				if (dx === 0 && dz === 0 && layer <= 0) continue;
				decorations.push([
					x + dx,
					y + trunkHeight - 1 + layer,
					z + dz,
					"leaves",
					species | 4,
				]);
			}
		}
	}
}

/** Deterministically scatters trees, tall grass, and flowers over gentle slopes. */
export function generateMountainDecorations(
	a: RidgeNode,
	b: RidgeNode,
	baseY: number,
	treeMode: number,
	amount: number,
): MountainDecoration[] {
	const heightMap = createRidgeHeightMap(a, b);
	const values = heightMap.values;
	const decorations: MountainDecoration[] = [];
	const treeRoots: [number, number][] = [];
	const amountIndex = Math.max(0, Math.min(2, amount));
	const treeChance = [0.008, 0.015, 0.028][amountIndex];
	const plantChance = [0.06, 0.12, 0.2][amountIndex];
	for (let x = 1; x < values.length - 1; x++) {
		for (let z = 1; z < values[x].length - 1; z++) {
			const height = Math.floor(values[x][z]);
			if (height <= 0) continue;
			const slope = Math.max(
				Math.abs(height - Math.floor(values[x - 1][z])),
				Math.abs(height - Math.floor(values[x + 1][z])),
				Math.abs(height - Math.floor(values[x][z - 1])),
				Math.abs(height - Math.floor(values[x][z + 1])),
			);
			const worldX = heightMap.originX + x;
			const worldZ = heightMap.originZ + z;
			const worldY = baseY + height + 1;
			let canPlaceTree =
				slope <= 1 && mountainHash(worldX, worldZ, 1) < treeChance;
			if (canPlaceTree) {
				for (let i = 0; i < treeRoots.length; i++) {
					const dx = worldX - treeRoots[i][0];
					const dz = worldZ - treeRoots[i][1];
					if (dx * dx + dz * dz < 25) {
						canPlaceTree = false;
						break;
					}
				}
			}
			if (canPlaceTree) {
				let species = treeMode === 1 ? 2 : treeMode === 2 ? 1 : 0;
				if (treeMode === 3)
					species = mountainHash(worldX, worldZ, 2) < 0.5 ? 0 : 2;
				addTree(decorations, worldX, worldY, worldZ, species);
				treeRoots.push([worldX, worldZ]);
				continue;
			}
			if (slope <= 2 && mountainHash(worldX, worldZ, 3) < plantChance) {
				const plant = mountainHash(worldX, worldZ, 4);
				if (plant < 0.65)
					decorations.push([worldX, worldY, worldZ, "tallgrass", 1]);
				else if (plant < 0.82)
					decorations.push([
						worldX,
						worldY,
						worldZ,
						"yellowFlower",
						0,
					]);
				else decorations.push([worldX, worldY, worldZ, "redFlower", 0]);
			}
		}
	}
	return decorations;
}
