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

export type RidgeSegment = {
	a: RidgeNode;
	b: RidgeNode;
};

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

function getHorizontalLength(a: RidgeNode, b: RidgeNode): number {
	const dx = b.x - a.x;
	const dz = b.z - a.z;
	return Math.sqrt(dx * dx + dz * dz);
}

function getHighToLowAngle(a: RidgeNode, b: RidgeNode): number {
	let high = a;
	let low = b;
	if (b.height > a.height) {
		high = b;
		low = a;
	}
	return Math.atan2(low.z - high.z, low.x - high.x);
}

function getAngleDifference(a: number, b: number): number {
	let difference = Math.abs(a - b) % (Math.PI * 2);
	if (difference > Math.PI) difference = Math.PI * 2 - difference;
	return difference;
}

function getBranchRandom(
	nodes: RidgeNode[],
	index: number,
	playerNodeCount: number,
): number {
	let value = (index + 1) * 12.9898;
	for (let i = 0; i < playerNodeCount; i++)
		value +=
			nodes[i].x * 78.233 +
			nodes[i].z * 37.719 +
			nodes[i].height * 19.913;
	const random = Math.sin(value) * 43758.5453;
	return random - Math.floor(random);
}

function createBranchEnd(
	start: RidgeNode,
	angle: number,
	length: number,
	templateEnd: RidgeNode,
): RidgeNode {
	return {
		x: start.x + Math.cos(angle) * length,
		z: start.z + Math.sin(angle) * length,
		height: templateEnd.height,
		width: templateEnd.width,
	};
}

/** Creates selected ridge segments and optional deterministic branch ridges. */
export function createRidgeSegments(
	nodes: RidgeNode[],
	playerNodeCount: number = nodes.length,
	autoBranchMode: boolean = false,
	maxSegments: number = 32,
): RidgeSegment[] {
	const segments: RidgeSegment[] = [];
	const manualCount = Math.max(0, Math.min(playerNodeCount, nodes.length));
	for (
		let i = 0;
		i + 1 < nodes.length && segments.length < maxSegments;
		i++
	) {
		if (getHorizontalLength(nodes[i], nodes[i + 1]) <= 0) continue;
		segments.push({ a: nodes[i], b: nodes[i + 1] });
	}
	if (!autoBranchMode || manualCount < 3) return segments;

	type BranchTip = { segment: RidgeSegment; templateIndex: number };
	const minimumAngle = (10 * Math.PI) / 180;
	for (
		let nodeIndex = 1;
		nodeIndex + 1 < manualCount && segments.length < maxSegments;
		nodeIndex++
	) {
		const previous = nodes[nodeIndex - 1];
		const start = nodes[nodeIndex];
		const templateEnd = nodes[nodeIndex + 1];
		const length = getHorizontalLength(start, templateEnd);
		if (length <= 0) continue;
		const baseAngle = getHighToLowAngle(previous, start);
		const nextAngle = Math.atan2(
			templateEnd.z - start.z,
			templateEnd.x - start.x,
		);
		const candidates = [baseAngle + Math.PI / 2, baseAngle - Math.PI / 2];
		const preferred =
			getBranchRandom(nodes, nodeIndex, manualCount) < 0.5 ? 0 : 1;
		let branchAngle = candidates[preferred];
		if (getAngleDifference(branchAngle, nextAngle) < minimumAngle)
			branchAngle = candidates[1 - preferred];
		const root: RidgeSegment = {
			a: start,
			b: createBranchEnd(start, branchAngle, length, templateEnd),
		};
		segments.push(root);

		const tips: BranchTip[] = [
			{ segment: root, templateIndex: nodeIndex + 1 },
		];
		for (
			let tipIndex = 0;
			tipIndex < tips.length && segments.length < maxSegments;
			tipIndex++
		) {
			const tip = tips[tipIndex];
			if (tip.templateIndex + 1 >= manualCount) continue;
			const nextTemplate = nodes[tip.templateIndex + 1];
			const templateLength = getHorizontalLength(
				nodes[tip.templateIndex],
				nextTemplate,
			);
			if (templateLength <= 0) continue;
			const tipAngle = getHighToLowAngle(tip.segment.a, tip.segment.b);
			for (let side = -1; side <= 1; side += 2) {
				if (segments.length >= maxSegments) break;
				const child: RidgeSegment = {
					a: tip.segment.b,
					b: createBranchEnd(
						tip.segment.b,
						tipAngle + (side * Math.PI) / 2,
						templateLength,
						nextTemplate,
					),
				};
				segments.push(child);
				tips.push({
					segment: child,
					templateIndex: tip.templateIndex + 1,
				});
			}
		}
	}
	return segments;
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
			const roundnessRadius =
				roundnessMode === 1 ? 0.25 : roundnessMode >= 2 ? 0.5 : 0;
			if (roundnessRadius > 0 && distanceRate < roundnessRadius) {
				const rateSq = distanceRate * distanceRate;
				profile =
					1 -
					(2 * rateSq) / roundnessRadius +
					(rateSq * distanceRate) /
						(roundnessRadius * roundnessRadius);
			}
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
	autoBranchMode: boolean = false,
	playerNodeCount: number = nodes.length,
): MountainHeightMap {
	if (nodes.length === 0)
		return { originX: 0, originZ: 0, values: createHeightMap(1, 1) };
	const segments = createRidgeSegments(
		nodes,
		playerNodeCount,
		autoBranchMode,
	);
	const segmentNodes: RidgeNode[] = [];
	for (let i = 0; i < segments.length; i++) {
		segmentNodes.push(segments[i].a);
		segmentNodes.push(segments[i].b);
	}
	if (segmentNodes.length === 0) segmentNodes.push(nodes[0]);
	let minX = segmentNodes[0].x;
	let minZ = segmentNodes[0].z;
	let maxX = segmentNodes[0].x;
	let maxZ = segmentNodes[0].z;
	let maxWidth = segmentNodes[0].width;
	for (let i = 1; i < segmentNodes.length; i++) {
		minX = Math.min(minX, segmentNodes[i].x);
		minZ = Math.min(minZ, segmentNodes[i].z);
		maxX = Math.max(maxX, segmentNodes[i].x);
		maxZ = Math.max(maxZ, segmentNodes[i].z);
		maxWidth = Math.max(maxWidth, segmentNodes[i].width);
	}
	const margin = Math.ceil(maxWidth);
	const originX = Math.floor(minX) - margin;
	const originZ = Math.floor(minZ) - margin;
	maxX = Math.ceil(maxX) + margin;
	maxZ = Math.ceil(maxZ) + margin;
	const values = createHeightMap(maxX - originX + 1, maxZ - originZ + 1);
	for (let i = 0; i < segments.length; i++)
		applyRidgeSegment(
			values,
			{
				x: segments[i].a.x - originX,
				z: segments[i].a.z - originZ,
				height: segments[i].a.height,
				width: segments[i].a.width,
			},
			{
				x: segments[i].b.x - originX,
				z: segments[i].b.z - originZ,
				height: segments[i].b.height,
				width: segments[i].b.width,
			},
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
	autoBranchMode: boolean = false,
	playerNodeCount: number = nodes.length,
	blockLimit: number = Number.POSITIVE_INFINITY,
): MountainBlock[] {
	return heightMapToBlocks(
		createRidgeHeightMap(
			nodes,
			roundnessMode,
			sagMode,
			autoBranchMode,
			playerNodeCount,
		),
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
	autoBranchMode: boolean = false,
	playerNodeCount: number = nodes.length,
): [number, number, number][] {
	const heightMap = createRidgeHeightMap(
		nodes,
		roundnessMode,
		sagMode,
		autoBranchMode,
		playerNodeCount,
	);
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
	autoBranchMode: boolean = false,
	playerNodeCount: number = nodes.length,
): MountainSurfaceTriangle[] {
	const heightMap = createRidgeHeightMap(
		nodes,
		roundnessMode,
		sagMode,
		autoBranchMode,
		playerNodeCount,
	);
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
