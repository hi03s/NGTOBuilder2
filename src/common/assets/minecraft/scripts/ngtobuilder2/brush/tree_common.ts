import { BlockSet, NGTObject } from "jp.ngt.ngtlib.block";
import { NGTFileLoader, NGTText } from "jp.ngt.ngtlib.io";
import { ArrayList } from "java.util";
import { ZipInputStream } from "java.util.zip";
import { Block } from "net.minecraft.block";
import { ResourceLocation } from "net.minecraft.util";
import { World } from "net.minecraft.world";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { RotatableBlockObject } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObject";
import { RotatableBlockSet } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockSet";

export type TreePresetJson = {
	ngtz: string[];
	modid?: string[];
};

export type TreePreset = {
	name: string;
	ngtz: string[];
	ngtoList: NGTObject[];
};

export type TreeCandidate = {
	x: number;
	z: number;
	ngtoIndex: number;
	yaw: number;
	extraHeight: number;
};

const TREE_TYPE_PATH = "scripts/ngtobuilder2/brush/treeType.json";
let presetCache: TreePreset[] | null = null;
const presetBlockKeyCache: { [name: string]: { [key: string]: boolean } } = {};

function resource(path: string): ResourceLocation {
	return new ResourceLocation("minecraft", path);
}

function loadNGTZ(path: string): NGTObject[] {
	const result: NGTObject[] = [];
	const input = NGTFileLoader.getInputStream(resource(path));
	if (!input) return result;
	const zip = new ZipInputStream(input);
	try {
		let entry = zip.getNextEntry();
		while (entry) {
			if (!entry.isDirectory() && /\.ngto$/i.test(entry.getName())) {
				result.push(NGTObject.load(zip));
			}
			zip.closeEntry();
			entry = zip.getNextEntry();
		}
	} finally {
		zip.close();
	}
	return result;
}

export function getTreePresets(): TreePreset[] {
	if (presetCache) return presetCache;
	const json = NGTText.getText(resource(TREE_TYPE_PATH), true);
	const source = JSON.parse(json) as { [name: string]: TreePresetJson };
	const presets: TreePreset[] = [];
	Object.keys(source).forEach((name) => {
		const config = source[name];
		if (!config || !config.ngtz || config.ngtz.length === 0) return;
		const requiredMods = config.modid || [];
		for (let i = 0; i < requiredMods.length; i++) {
			if (!RTMApiCompat.isModLoaded(requiredMods[i])) return;
		}
		const ngtoList: NGTObject[] = [];
		config.ngtz.forEach((path) => {
			loadNGTZ(path).forEach((ngto) => ngtoList.push(ngto));
		});
		if (ngtoList.length > 0)
			presets.push({ name: name, ngtz: config.ngtz, ngtoList: ngtoList });
	});
	presetCache = presets;
	return presets;
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

function randomAt(seed: number, x: number, z: number, salt: number): number {
	const mixed =
		(seed | 0) ^
		imul(x | 0, 0x1f123bb5) ^
		imul(z | 0, 0x5f356495) ^
		imul(salt | 0, 0x6c8e9cf5);
	return mix32(mixed) / 4294967296;
}

export function createTreeCandidates(
	centerX: number,
	centerZ: number,
	radius: number,
	density: number,
	seed: number,
	ngtoCount: number,
): TreeCandidate[] {
	const result: TreeCandidate[] = [];
	if (ngtoCount <= 0 || density <= 0) return result;
	const radiusSq = radius * radius;
	for (let x = centerX - radius; x <= centerX + radius; x++) {
		for (let z = centerZ - radius; z <= centerZ + radius; z++) {
			const dx = x - centerX;
			const dz = z - centerZ;
			if (dx * dx + dz * dz > radiusSq) continue;
			// 表示上の密度に対して実効確率を1/10にし、各XZブロックを独立抽選する。
			if (randomAt(seed, x, z, 0) >= density / 1000) continue;
			result.push({
				x: x,
				z: z,
				ngtoIndex: Math.floor(randomAt(seed, x, z, 1) * ngtoCount),
				yaw: Math.floor(randomAt(seed, x, z, 2) * 4) * 90,
				extraHeight: Math.floor(randomAt(seed, x, z, 3) * 3),
			});
		}
	}
	return result;
}

export function createTallTreeObject(
	ngto: NGTObject,
	extraHeight: number,
): RotatableBlockObject {
	const result = new RotatableBlockObject();
	for (let y = 0; y < ngto.ySize; y++) {
		for (let x = 0; x < ngto.xSize; x++) {
			for (let z = 0; z < ngto.zSize; z++) {
				const blockSet = ngto.getBlockSet(x, y, z);
				if (Block.getIdFromBlock(blockSet.block) === 0) continue;
				if (y === 0) {
					for (let repeat = 0; repeat <= extraHeight; repeat++)
						result.add(new RotatableBlockSet(blockSet, x, repeat, z));
				} else {
					result.add(new RotatableBlockSet(blockSet, x, y + extraHeight, z));
				}
			}
		}
	}
	result.calcSize();
	return result;
}

export function createTallTreeNGTO(
	ngto: NGTObject,
	extraHeight: number,
): NGTObject {
	const height = ngto.ySize + extraHeight;
	const list = new ArrayList<BlockSet>();
	const total = ngto.xSize * height * ngto.zSize;
	for (let i = 0; i < total; i++) list.add(BlockSet.AIR);
	for (let x = 0; x < ngto.xSize; x++) {
		for (let z = 0; z < ngto.zSize; z++) {
			const bottom = ngto.getBlockSet(x, 0, z);
			for (let y = 0; y <= extraHeight; y++)
				list.set((x * height + y) * ngto.zSize + z, bottom);
			for (let y = 1; y < ngto.ySize; y++)
				list.set(
					(x * height + y + extraHeight) * ngto.zSize + z,
					ngto.getBlockSet(x, y, z),
				);
		}
	}
	return NGTObject.createNGTO(
		list,
		ngto.xSize,
		height,
		ngto.zSize,
		ngto.origX,
		ngto.origY,
		ngto.origZ,
	);
}

export function blockSetKey(blockSet: BlockSet): string {
	return `${Block.getIdFromBlock(blockSet.block)}:${blockSet.metadata}`;
}

export function getPresetBlockKeys(preset: TreePreset): {
	[key: string]: boolean;
} {
	const cached = presetBlockKeyCache[preset.name];
	if (cached) return cached;
	const keys: { [key: string]: boolean } = {};
	preset.ngtoList.forEach((ngto) => {
		for (let rotation = 0; rotation < 4; rotation++) {
			const tree = createTallTreeObject(ngto, 0);
			const centerX = Math.floor(ngto.xSize / 2) + 0.5;
			const centerZ = Math.floor(ngto.zSize / 2) + 0.5;
			tree.setPivot(centerX, 0.5, centerZ).rotate(rotation * 90, 0, 0);
			for (let i = 0; i < tree.blockSetList.length; i++) {
				const blockSet = tree.blockSetList[i].blockSet;
				if (Block.getIdFromBlock(blockSet.block) !== 0)
					keys[blockSetKey(blockSet)] = true;
			}
		}
	});
	presetBlockKeyCache[preset.name] = keys;
	return keys;
}

export function getSurfaceY(world: World, x: number, z: number): number {
	const air = RTMApiCompat.getBlockAir();
	for (let y = 255; y >= 0; y--) {
		const block = RTMApiCompat.getBlock(world, x, y, z);
		if (block && block !== air) return y + 1;
	}
	return 0;
}

export function isValidTreeGround(
	world: World,
	x: number,
	surfaceY: number,
	z: number,
): boolean {
	if (surfaceY <= 0) return false;
	const ground = RTMApiCompat.getBlock(world, x, surfaceY - 1, z);
	return (
		ground === RTMApiCompat.getBlockGrass() ||
		ground === RTMApiCompat.getBlockDirt()
	);
}

export function getEraseGroundY(
	world: World,
	x: number,
	z: number,
	targetKeys: { [key: string]: boolean },
): number {
	const air = RTMApiCompat.getBlockAir();
	for (let y = 255; y >= 0; y--) {
		const block = RTMApiCompat.getBlock(world, x, y, z);
		if (!block || block === air) continue;
		const metadata = RTMApiCompat.getMetadata(world, x, y, z);
		const key = `${Block.getIdFromBlock(block)}:${metadata === null ? 0 : metadata}`;
		if (!targetKeys[key]) return y;
	}
	return -1;
}
