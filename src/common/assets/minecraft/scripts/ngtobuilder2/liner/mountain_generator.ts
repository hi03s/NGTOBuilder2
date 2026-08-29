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

/** Burns one ridge segment into a height map. */
export function applyRidgeSegment(
	heightMap: number[][],
	a: RidgeNode,
	b: RidgeNode,
	roundnessMode: number = 0,
	sagMode: number = 1,
): void {
	if (heightMap.length === 0 || heightMap[0].length === 0) return;
	const mapWidth = heightMap.length;
	const mapDepth = heightMap[0].length;
	const abx = b.x - a.x;
	const abz = b.z - a.z;
	const abLenSq = abx * abx + abz * abz;
	const segmentLength = Math.sqrt(abLenSq);
	const sagFactors = [0, 0.025, 0.05];
	const sagFactor = sagFactors[Math.max(0, Math.min(2, sagMode))];

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
			const sag = segmentLength * sagFactor * 4 * rate * (1 - rate);
			const ridgeHeight = Math.max(
				0,
				lerp(a.height, b.height, rate) - sag,
			);
			const ridgeWidth = lerp(a.width, b.width, rate);
			if (ridgeWidth <= 0) continue;
			const distanceRate = distance / ridgeWidth;
			if (distanceRate >= 1) continue;
			let profile = 1 - distanceRate;
			if (roundnessMode === 1)
				profile = Math.cos((distanceRate * Math.PI) / 2);
			else if (roundnessMode >= 2)
				profile = Math.sqrt(
					Math.max(0, 1 - distanceRate * distanceRate),
				);
			const candidateHeight = ridgeHeight * profile;
			heightMap[x][z] = Math.max(heightMap[x][z], candidateHeight);
		}
	}
}

/** Creates the smallest map that contains the influence area of all segments. */
export function createRidgeHeightMap(
	nodes: RidgeNode[],
	roundnessMode: number = 0,
	sagMode: number = 1,
): MountainHeightMap {
	if (nodes.length === 0)
		return { originX: 0, originZ: 0, values: createHeightMap(1, 1) };
	let minX = nodes[0].x;
	let minZ = nodes[0].z;
	let maxX = nodes[0].x;
	let maxZ = nodes[0].z;
	let maxWidth = nodes[0].width;
	for (let i = 1; i < nodes.length; i++) {
		minX = Math.min(minX, nodes[i].x);
		minZ = Math.min(minZ, nodes[i].z);
		maxX = Math.max(maxX, nodes[i].x);
		maxZ = Math.max(maxZ, nodes[i].z);
		maxWidth = Math.max(maxWidth, nodes[i].width);
	}
	const margin = Math.ceil(maxWidth);
	const originX = Math.floor(minX) - margin;
	const originZ = Math.floor(minZ) - margin;
	maxX = Math.ceil(maxX) + margin;
	maxZ = Math.ceil(maxZ) + margin;
	const values = createHeightMap(maxX - originX + 1, maxZ - originZ + 1);
	const localNodes: RidgeNode[] = [];
	for (let i = 0; i < nodes.length; i++) {
		localNodes.push({
			x: nodes[i].x - originX,
			z: nodes[i].z - originZ,
			height: nodes[i].height,
			width: nodes[i].width,
		});
	}
	for (let i = 0; i + 1 < localNodes.length; i++)
		applyRidgeSegment(
			values,
			localNodes[i],
			localNodes[i + 1],
			roundnessMode,
			sagMode,
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
	nodes: RidgeNode[],
	baseY: number,
	roundnessMode: number = 0,
	sagMode: number = 1,
	blockLimit: number = Number.POSITIVE_INFINITY,
): MountainBlock[] {
	return heightMapToBlocks(
		createRidgeHeightMap(nodes, roundnessMode, sagMode),
		baseY,
		blockLimit,
	);
}

/** Returns only the top of each column for a lightweight client preview. */
export function generateMountainSurfacePositions(
	nodes: RidgeNode[],
	baseY: number,
	roundnessMode: number = 0,
	sagMode: number = 1,
): [number, number, number][] {
	const heightMap = createRidgeHeightMap(nodes, roundnessMode, sagMode);
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
	nodes: RidgeNode[],
	baseY: number,
	roundnessMode: number = 0,
	sagMode: number = 1,
): MountainSurfaceTriangle[] {
	const heightMap = createRidgeHeightMap(nodes, roundnessMode, sagMode);
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
			const p00: [number, number, number] = [x0, baseY + h00 + 1.02, z0];
			const p10: [number, number, number] = [x1, baseY + h10 + 1.02, z0];
			const p01: [number, number, number] = [x0, baseY + h01 + 1.02, z1];
			const p11: [number, number, number] = [x1, baseY + h11 + 1.02, z1];
			triangles.push([p00, p10, p11]);
			triangles.push([p00, p11, p01]);
		}
	}
	return triangles;
}
