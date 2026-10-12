import { RailMap, RailMapBasic, RailPosition } from "jp.ngt.rtm.rail.util";
import { TileEntityLargeRailCore } from "jp.ngt.rtm.rail";
import { TileEntityLargeRailSectionCore } from "jp.apple.rail";

// 共通の1.12.2 APIはmc1122ターゲットから継承する。
export class RTMApiCompat {
	static getSectionRailPositions(
		core: TileEntityLargeRailCore,
	): JavaObjectArray<RailPosition> | null {
		return core instanceof TileEntityLargeRailSectionCore &&
			core.isRailSection()
			? core.getLogicalRailPositions()
			: null;
	}

	static createLogicalRailMap(
		start: RailPosition,
		end: RailPosition,
		version?: number,
	): RailMap {
		return new RailMapBasic(
			start,
			end,
			typeof version === "number"
				? version
				: RailMapBasic.fixRTMRailMapVersionCurrent,
		);
	}
}
