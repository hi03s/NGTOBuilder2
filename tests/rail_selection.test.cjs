const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require(
	require.resolve("typescript", {
		paths: [path.dirname(require.resolve("rtm-ts/package.json"))],
	}),
);

const scripts = path.resolve(
	__dirname,
	"../src/common/assets/minecraft/scripts",
);
class JavaMap extends Map {
	put(key, value) {
		this.set(key, value);
	}
}
class RailBase {
	constructor(core) {
		this.core = core;
	}
	getRailCore() {
		return this.core;
	}
}
class SwitchCore {}
class SectionCore {}
class RailMap {
	constructor(start, end, version) {
		this.start = start;
		this.end = end;
		this.version = version;
	}
	getStartRP() {
		return this.start;
	}
	getEndRP() {
		return this.end;
	}
}
class Vec3 {
	constructor(x, y, z) {
		this.values = [x, y, z];
	}
	length() {
		return Math.hypot(...this.values);
	}
}
const compat = {
	isSectionRailCore: (core) => core instanceof SectionCore,
	getSectionRailPositions: (core) => core.getLogicalRailPositions(),
	getWorld: (entity) => entity.world,
	getTileEntity: (world, x) => world.tiles[x],
	createLogicalRailMap: (start, end, version) =>
		new RailMap(start, end, version),
};
function load(file, modules) {
	const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES5,
		},
	}).outputText;
	const exports = {};
	vm.runInNewContext(source, {
		exports,
		require: (name) => modules[name] || {},
	});
	return exports;
}
const { NGTOBuilderUtil: util } = load(
	path.join(scripts, "lib_hi03toolkit_1_0/lib_NGTOBuilderUtil.ts"),
	{
		"java.util": {
			HashMap: JavaMap,
			IdentityHashMap: JavaMap,
			WeakHashMap: JavaMap,
		},
		"jp.ngt.rtm.rail": {
			TileEntityLargeRailBase: RailBase,
			TileEntityLargeRailSwitchCore: SwitchCore,
		},
		"jp.ngt.rtm.rail.util": { RailPosition: { REVISION: [[0, 0.5]] } },
		"jp.ngt.ngtlib.math": { Vec3 },
		"@target/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat":
			{ RTMApiCompat: compat },
	},
);
const { RailMapCollector } = load(
	path.join(scripts, "lib_hi03toolkit_1_0/lib_RailMapCollector.ts"),
	{
		"java.util": { HashMap: JavaMap },
		"./lib_NGTOBuilderUtil": { NGTOBuilderUtil: util },
	},
);
function position(x, z) {
	return {
		posX: x,
		posY: 64,
		posZ: z,
		blockX: x,
		blockY: 64,
		blockZ: z,
		direction: 0,
		anchorLengthHorizontal: 30,
		writeToNBT() {
			return JSON.stringify(this);
		},
	};
}
function section(className, group, positions) {
	return Object.assign(new SectionCore(), {
		fixRTMRailMapVersion: 7,
		getClass: () => ({ getName: () => className }),
		isRailSection: () => true,
		getLogicalRailPositions: () => positions.map((rp) => ({ ...rp })),
		getRailGroupId: () => ({ toString: () => group }),
		getRailMap: () => {
			throw Error("Physical section must not be selected");
		},
	});
}
function entityFor(...cores) {
	return { world: { tiles: cores.map((core) => new RailBase(core)) } };
}
function at(entity, x) {
	return util.getRailMapAt(entity, x, 64, 0);
}

for (const className of [
	"jp.kaiz.kaizpatch.rtm.rail.TileEntityLargeRailSectionCore",
	"jp.apple.rail.TileEntityLargeRailSectionCore",
]) {
	test(`${className}: full rail, group deduplication, reverse and undo`, () => {
		const positions = [position(0, 0), position(120, 50)];
		const entity = entityFor(
			section(className, "rail-a", positions),
			section(className, "rail-a", positions),
			section(className, "rail-b", positions),
		);
		const first = at(entity, 0);
		assert.equal(first.getEndRP().posX, 120);
		assert.equal(first.version, 7);
		assert.equal(at(entity, 0), first, "unchanged geometry is cached");
		const collector = new RailMapCollector();
		collector.addAt(entity, 0, 64, 0, true);
		collector.addAt(entity, 1, 64, 0, false);
		assert.equal(collector.size(entity), 1);
		assert.equal(collector.hasRailMap(entity, at(entity, 1)), true);
		collector.addAt(entity, 2, 64, 0, false);
		assert.equal(
			collector.size(entity),
			2,
			"different groups sharing endpoints remain distinct",
		);
		collector.pop(entity);
		assert.equal(collector.pop(entity)[1], true);
		assert.equal(collector.size(entity), 0);
		collector.addAt(entity, 1, 64, 0, false);
		assert.equal(collector.size(entity), 1, "can reselect after undo");
	});
	test(`${className}: changed endpoints refresh geometry; connection uses logical endpoint`, () => {
		const positions = [position(0, 0), position(120, 50)];
		const entity = entityFor(
			section(className, "rail-c", positions),
			section(className, "rail-d", [
				position(120, 51),
				position(200, 70),
			]),
		);
		const first = at(entity, 0);
		const collector = new RailMapCollector();
		collector.add(entity, first, false);
		assert.equal(collector.isConnectedRailAt(entity, 1, 64, 0), true);
		positions[1].anchorLengthHorizontal = 60;
		const refreshed = at(entity, 0);
		assert.notEqual(refreshed, first);
		assert.equal(refreshed.getEndRP().anchorLengthHorizontal, 60);
		assert.equal(collector.hasRailMap(entity, refreshed), true);
	});
	test(`${className}: uninitialized section is ignored and recovers`, () => {
		const core = section(className, "rail-e", [
			position(0, 0),
			position(120, 0),
		]);
		const entity = entityFor(core);
		const readyPositions = core.getLogicalRailPositions;
		core.getLogicalRailPositions = () => null;
		assert.equal(at(entity, 0), null);
		core.getLogicalRailPositions = () => [null, position(120, 0)];
		assert.equal(at(entity, 0), null);
		core.getLogicalRailPositions = readyPositions;
		core.isRailSection = () => false;
		assert.equal(at(entity, 0), null);
		core.isRailSection = () => true;
		assert.ok(at(entity, 0));
	});
}

test("ordinary rail and switch selection retain existing behavior", () => {
	const physical = new RailMap(position(0, 0), position(10, 0));
	const normal = {
		getClass: () => ({
			getName: () => "jp.ngt.rtm.rail.TileEntityLargeRailNormalCore",
		}),
		getRailMap: () => physical,
	};
	const switchCore = new SwitchCore();
	const branch = (x) => ({
		getLength: () => 10,
		getNearlestPoint: () => 0,
		getRailPos: () => [0, x],
	});
	const near = branch(1),
		far = branch(10);
	switchCore.getAllRailMaps = () => [far, near];
	const entity = entityFor(normal, switchCore);
	assert.equal(at(entity, 0), physical);
	assert.equal(at(entity, 1), near);
	switchCore.getAllRailMaps = () => null;
	assert.equal(at(entity, 1), null);
});

for (const [target, sectionPackage] of [
	["kaizpatch", "jp.kaiz.kaizpatch.rtm.rail"],
	["appleextended", "jp.apple.rail"],
])
	test(`${target} detects section subclasses and uses the logical endpoints`, () => {
		class Basic extends RailMap {}
		class Section {
			isRailSection() {
				return true;
			}
			getLogicalRailPositions() {
				return [position(0, 0), position(100, 0)];
			}
		}
		Basic.fixRTMRailMapVersionCurrent = 9;
		const file = path.resolve(
			__dirname,
			`../src/${target}/assets/minecraft/scripts/lib_hi03toolkit_1_0/lib_RTMApiCompat.compat.ts`,
		);
		const { RTMApiCompat } = load(file, {
			"jp.ngt.rtm.rail.util": { RailMapBasic: Basic },
			[sectionPackage]: { TileEntityLargeRailSectionCore: Section },
			"net.minecraftforge.fml.common": {
				Loader: { isModLoaded: () => false },
			},
		});
		class DerivedSection extends Section {
			getClass() {
				throw new Error(
					"Detection must not rely on a class name string",
				);
			}
		}
		assert.equal(RTMApiCompat.isSectionRailCore(new Section()), true);
		assert.equal(
			RTMApiCompat.isSectionRailCore(new DerivedSection()),
			true,
		);
		assert.equal(RTMApiCompat.isSectionRailCore({}), false);
		assert.equal(
			RTMApiCompat.getSectionRailPositions(new DerivedSection())[1].posX,
			100,
		);
		assert.equal(
			RTMApiCompat.getSectionRailPositions(new Section())[1].posX,
			100,
		);
		assert.equal(RTMApiCompat.getSectionRailPositions({}), null);
		assert.equal(
			RTMApiCompat.createLogicalRailMap(position(0, 0), position(100, 0))
				.version,
			9,
		);
		assert.equal(
			RTMApiCompat.createLogicalRailMap(
				position(0, 0),
				position(100, 0),
				3,
			).version,
			3,
		);
	});

test("AppleExtended is dispatched before generic 1.12.2 and inherits its compatibility API", () => {
	const config = JSON.parse(
		fs.readFileSync(path.resolve(__dirname, "../rtmx.json"), "utf8"),
	);
	const targets = Object.keys(config.targets);
	assert.ok(targets.indexOf("appleextended") < targets.indexOf("mc1122"));
	assert.equal(config.targets.appleextended.compatFallbackTarget, "mc1122");
	const dispatch = config.targets.appleextended.runtimeDispatch;
	for (const loaded of [true, false]) {
		assert.equal(
			vm.runInNewContext(dispatch, {
				Packages: {
					net: {
						minecraftforge: {
							fml: {
								common: {
									Loader: {
										isModLoaded: (id) =>
											id === "applelib" && loaded,
									},
								},
							},
						},
					},
				},
			}),
			loaded,
		);
	}
});
