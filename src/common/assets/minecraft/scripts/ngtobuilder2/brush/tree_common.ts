import { BlockSet, NGTObject } from "jp.ngt.ngtlib.block";
import { NGTFileLoader, NGTLog, NGTText } from "jp.ngt.ngtlib.io";
import { ArrayList } from "java.util";
import { ZipInputStream } from "java.util.zip";
import { Block } from "net.minecraft.block";
import { ResourceLocation } from "net.minecraft.util";
import { World } from "net.minecraft.world";
import { RTMApiCompat } from "@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat";
import { RotatableBlockObject } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockObject";
import { RotatableBlockSet } from "../../lib_hi03toolkit_1_0/lib_RotatableBlockSet";

export type TreePresetJson = {
	id?: string;
	name?: string;
	blocks: string[];
	modid?: string[];
	order?: number;
	randomHeight?: boolean;
};

export type TreePreset = {
	id: string;
	name: string;
	blocks: string[];
	ngtoList: NGTObject[];
	missingBlocks: string[];
	order: number;
	randomHeight: boolean;
};

type ExternalTreeManifest = TreePresetJson & {
	format?: number;
	presets?: TreePresetJson[];
};

export type TreeCandidate = {
	x: number;
	z: number;
	ngtoIndex: number;
	yaw: number;
	extraHeight: number;
};

const TREE_TYPE_PATH = "scripts/ngtobuilder2/brush/treeType.json";
const EXTERNAL_MANIFEST_SUFFIX = ".ngtobtree.json";
let presetCache: TreePreset[] | null = null;
let presetSignatureCache: string | null = null;
const presetBlockKeyCache: { [name: string]: { [key: string]: boolean } } = {};

type InputLike = { close(): void };
type ExternalFile = {
	getName(): string;
	getParentFile(): ExternalFile;
};
type ExternalFileList = {
	size(): number;
	get(index: number): ExternalFile;
};

declare const Java: {
	extend(type: unknown): new (implementation: unknown) => unknown;
};

declare const Packages: {
	jp: {
		ngt: {
			ngtlib: {
				io: {
					FileMatcher: unknown;
				};
			};
		};
	};
	java: {
		io: {
			File: new (parent: ExternalFile, child: string) => ExternalFile;
		};
	};
};

function resource(path: string): ResourceLocation {
	return new ResourceLocation("minecraft", path);
}

// RTM 1.12のinclude展開では置換用特殊文字が誤解釈されるため、ここでは正規表現を使わない。
function hasExtension(path: string, extension: string): boolean {
	const lowerPath = String(path).toLowerCase();
	return lowerPath.slice(-extension.length) === extension;
}

function containsOnly(value: string, allowed: string): boolean {
	if (value.length === 0) return false;
	for (let i = 0; i < value.length; i++)
		if (allowed.indexOf(value.charAt(i)) < 0) return false;
	return true;
}

function isValidPresetId(id: string): boolean {
	const separator = id.indexOf(":");
	if (separator <= 0 || separator !== id.lastIndexOf(":")) return false;
	const namespace = id.slice(0, separator);
	const path = id.slice(separator + 1);
	return (
		containsOnly(namespace, "abcdefghijklmnopqrstuvwxyz0123456789_.-") &&
		containsOnly(path, "abcdefghijklmnopqrstuvwxyz0123456789_./-")
	);
}

function loadNGTZFromInput(input: InputLike): NGTObject[] {
	const result: NGTObject[] = [];
	const zip = new ZipInputStream(input as any);
	try {
		let entry = zip.getNextEntry();
		while (entry) {
			if (!entry.isDirectory() && hasExtension(entry.getName(), ".ngto")) {
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

function loadBlockInput(input: InputLike, path: string): NGTObject[] {
	if (hasExtension(path, ".ngtz")) return loadNGTZFromInput(input);
	if (hasExtension(path, ".ngto")) {
		try {
			return [NGTObject.load(input as any)];
		} finally {
			input.close();
		}
	}
	input.close();
	throw new Error(`Unsupported tree block file: ${path}`);
}

function loadBuiltInBlock(path: string): NGTObject[] {
	return loadBlockInput(
		NGTFileLoader.getInputStream(resource(path)) as unknown as InputLike,
		path,
	);
}

function loadExternalBlock(manifestFile: ExternalFile, path: string): NGTObject[] {
	const firstChar = path.length > 0 ? path.charAt(0) : "";
	if (
		path.indexOf("..") !== -1 ||
		firstChar === "/" ||
		firstChar.charCodeAt(0) === 92
	)
		throw new Error(`Invalid relative block path: ${path}`);
	const file = new Packages.java.io.File(
		manifestFile.getParentFile(),
		path.split(String.fromCharCode(92)).join("/"),
	);
	return loadBlockInput(
		NGTFileLoader.getInputStreamFromFile(file as any) as unknown as InputLike,
		path,
	);
}

function readExternalManifest(file: ExternalFile): ExternalTreeManifest {
	const input = NGTFileLoader.getInputStreamFromFile(
		file as any,
	) as unknown as InputLike;
	try {
		const lines = NGTText.readTextL(input as any, "UTF-8");
		return JSON.parse(NGTText.append(lines, true)) as ExternalTreeManifest;
	} finally {
		input.close();
	}
}

function getExternalManifestFiles(): ExternalFile[] {
	const Matcher = Java.extend(Packages.jp.ngt.ngtlib.io.FileMatcher);
	const matcher = new Matcher({
		match: (file: ExternalFile): boolean => {
			const name = String(file.getName()).toLowerCase();
			return name.slice(-EXTERNAL_MANIFEST_SUFFIX.length) === EXTERNAL_MANIFEST_SUFFIX;
		},
	});
	const files = (NGTFileLoader.findFile as any)(matcher) as ExternalFileList;
	const result: ExternalFile[] = [];
	for (let i = 0; i < files.size(); i++) result.push(files.get(i));
	return result;
}

function modsAvailable(config: TreePresetJson): boolean {
	const requiredMods = config.modid || [];
	for (let i = 0; i < requiredMods.length; i++)
		if (!RTMApiCompat.isModLoaded(requiredMods[i])) return false;
	return true;
}

function addPreset(
	presets: TreePreset[],
	ids: { [id: string]: boolean },
	config: TreePresetJson,
	fallbackName: string,
	loadBlock: (path: string) => NGTObject[],
): void {
	const id = config && config.id ? String(config.id).toLowerCase() : "";
	const name = config && config.name ? String(config.name) : fallbackName;
	if (!isValidPresetId(id))
		throw new Error(`Invalid or missing tree preset id: ${id || name}`);
	if (ids[id]) throw new Error(`Duplicate tree preset id: ${id}`);
	if (!config.blocks || config.blocks.length === 0)
		throw new Error(`Tree preset has no blocks: ${id}`);
	if (!modsAvailable(config)) return;
	const order = config.order === undefined ? 1000 : Number(config.order);
	if (!isFinite(order)) throw new Error(`Invalid tree preset order: ${id}`);
	if (
		config.randomHeight !== undefined &&
		typeof config.randomHeight !== "boolean"
	)
		throw new Error(`Invalid randomHeight value: ${id}`);
	const randomHeight =
		config.randomHeight === undefined ? true : config.randomHeight;
	const ngtoList: NGTObject[] = [];
	const missingBlocks: string[] = [];
	config.blocks.forEach((pathValue) => {
		const path = String(pathValue);
		if (!hasExtension(path, ".ngtz") && !hasExtension(path, ".ngto"))
			throw new Error(`Unsupported tree block file: ${path}`);
		try {
			const loaded = loadBlock(path);
			if (loaded.length === 0) {
				missingBlocks.push(path);
				NGTLog.debug(`[NGTO Builder2] Tree block contains no NGTO: ${id}: ${path}`);
			} else {
				loaded.forEach((ngto) => ngtoList.push(ngto));
			}
		} catch (error) {
			missingBlocks.push(path);
			NGTLog.debug(
				`[NGTO Builder2] Tree block load error: ${id}: ${path}: ${error}`,
			);
		}
	});
	ids[id] = true;
	presets.push({
		id: id,
		name: name,
		blocks: config.blocks,
		ngtoList: ngtoList,
		missingBlocks: missingBlocks,
		order: order,
		randomHeight: randomHeight,
	});
}

export function getTreePresets(): TreePreset[] {
	if (presetCache) return presetCache;
	const presets: TreePreset[] = [];
	const ids: { [id: string]: boolean } = {};
	const builtIn = JSON.parse(NGTText.getText(resource(TREE_TYPE_PATH), true)) as {
		[name: string]: TreePresetJson;
	};
	Object.keys(builtIn).forEach((name) => {
		try {
			addPreset(presets, ids, builtIn[name], name, loadBuiltInBlock);
		} catch (error) {
			NGTLog.debug(`[NGTO Builder2] Built-in tree preset error: ${name}: ${error}`);
		}
	});
	let manifestFiles: ExternalFile[] = [];
	try {
		manifestFiles = getExternalManifestFiles();
	} catch (error) {
		NGTLog.debug(`[NGTO Builder2] Tree manifest scan error: ${error}`);
	}
	manifestFiles.forEach((file) => {
		let manifest: ExternalTreeManifest;
		try {
			manifest = readExternalManifest(file);
			if (manifest.format !== undefined && Number(manifest.format) !== 1)
				throw new Error(`Unsupported manifest format: ${manifest.format}`);
		} catch (error) {
			NGTLog.debug(
				`[NGTO Builder2] External tree manifest error: ${file}: ${error}`,
			);
			return;
		}
		const configs: TreePresetJson[] =
			manifest.presets === undefined ? [manifest] : manifest.presets;
		if (!Array.isArray(configs)) {
			NGTLog.debug(
				`[NGTO Builder2] External tree presets must be an array: ${file}`,
			);
			return;
		}
		configs.forEach((config) => {
			try {
				if (!config.name) throw new Error("External tree preset name is required");
				addPreset(
					presets,
					ids,
					config,
					config.name || String(file.getName()),
					(path) => loadExternalBlock(file, path),
				);
			} catch (error) {
				NGTLog.debug(
					`[NGTO Builder2] External tree preset error: ${file}: ${error}`,
				);
			}
		});
	});
	presets.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
	presetCache = presets;
	return presets;
}

export function getTreePresetById(id: string): TreePreset | null {
	const presets = getTreePresets();
	for (let i = 0; i < presets.length; i++)
		if (presets[i].id === id) return presets[i];
	return null;
}

export function getTreePresetSignature(): string {
	if (presetSignatureCache) return presetSignatureCache;
	let hash = 0x811c9dc5;
	const addNumber = (value: number): void => {
		hash ^= value | 0;
		hash = imul(hash, 0x01000193);
	};
	const addString = (value: string): void => {
		for (let i = 0; i < value.length; i++) addNumber(value.charCodeAt(i));
	};
	getTreePresets().forEach((preset) => {
		addString(preset.id);
		addNumber(preset.randomHeight ? 1 : 0);
		preset.missingBlocks.forEach((path) => addString(path));
		preset.ngtoList.forEach((ngto) => {
			addNumber(ngto.xSize);
			addNumber(ngto.ySize);
			addNumber(ngto.zSize);
			for (let y = 0; y < ngto.ySize; y++)
				for (let x = 0; x < ngto.xSize; x++)
					for (let z = 0; z < ngto.zSize; z++) {
						const blockSet = ngto.getBlockSet(x, y, z);
						addNumber(Block.getIdFromBlock(blockSet.block));
						addNumber(blockSet.metadata);
					}
		});
	});
	presetSignatureCache = (hash >>> 0).toString(16);
	return presetSignatureCache;
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
	randomHeight: boolean,
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
				extraHeight: randomHeight
					? Math.floor(randomAt(seed, x, z, 3) * 3)
					: 0,
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
	const cached = presetBlockKeyCache[preset.id];
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
	presetBlockKeyCache[preset.id] = keys;
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
