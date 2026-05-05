import { HashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { BezierCurve3D, Pos } from "./lib_BezierCurve3D";

export class BezierCollector {
    private bezierHashMap: HashMap<Entity, BezierCurve3D[]>;

    constructor() {
        this.bezierHashMap = new HashMap();
    }

    add(entity: Entity, bezier: BezierCurve3D): void {
        const list = this.getOrCreateList(entity);
        list.push(bezier);
        this.set(entity, list);
    }

    addAll(entity: Entity, bezierList: BezierCurve3D[]): void {
        bezierList.forEach(bezier => { this.add(entity, bezier); });
    }

    createFromPosList(entity: Entity, posList: Pos[]): void {
        if (posList.length < 2) return;
        this.clear(entity);

        //2点は直線のベジェ曲線
        if (posList.length === 2) {
            const sp = posList[0];
            const ep = posList[1];
            const cp = BezierCurve3D.lerpPoint(sp, ep, 0.5);
            this.add(entity, new BezierCurve3D(sp, cp, ep));
            return;
        }

        //3点は1本のベジェ曲線
        if (posList.length === 3) {
            this.add(entity, new BezierCurve3D(posList[0], posList[1], posList[2]));
            return;
        }

        //4点以上は複数のベジェ曲線

        {//最初のベジェ曲線
            const sp = posList[0];
            const ep = BezierCurve3D.lerpPoint(sp, posList[1], 0.5);
            const cp = BezierCurve3D.lerpPoint(sp, ep, 0.5);
            this.add(entity, new BezierCurve3D(sp, cp, ep));
        }

        //中間のベジェ曲線
        for (let i = 1; i < posList.length - 1; i++) {
            const prevPos = posList[i - 1];
            const currenPos = posList[i];
            const nextPos = posList[i + 1];
            const sp = BezierCurve3D.lerpPoint(prevPos, currenPos, 0.5);
            const ep = BezierCurve3D.lerpPoint(currenPos, nextPos, 0.5);
            this.add(entity, new BezierCurve3D(sp, currenPos, ep));
        }

        {//最後のベジェ曲線
            const ep = posList[posList.length - 1];
            const sp = BezierCurve3D.lerpPoint(posList[posList.length - 2], ep, 0.5);
            const cp = BezierCurve3D.lerpPoint(sp, ep, 0.5);
            this.add(entity, new BezierCurve3D(sp, cp, ep));
        }
    }

    pop(entity: Entity): BezierCurve3D | null {
        const list = this.getOrCreateList(entity);
        if (list.length === 0) return null;
        const bezier = list.pop();
        if (!bezier) return null;
        this.set(entity, list);
        return bezier;
    }

    shift(entity: Entity): BezierCurve3D | null {
        const list = this.getOrCreateList(entity);
        if (list.length === 0) return null;
        const bezier = list.shift();
        if (!bezier) return null;
        this.set(entity, list);
        return bezier;
    }

    clear(entity: Entity): void {
        this.set(entity, []);
    }

    getAll(entity: Entity): BezierCurve3D[] {
        return this.getOrCreateList(entity);
    }

    getLast(entity: Entity): BezierCurve3D | null {
        const list = this.getOrCreateList(entity);
        if (list.length === 0) return null;
        return list[list.length - 1];
    }

    size(entity: Entity): number {
        const list = this.getOrCreateList(entity);
        return list.length;
    }

    private getOrCreateList(entity: Entity): BezierCurve3D[] {
        let list = this.bezierHashMap.get(entity);
        if (!list) {
            list = [];
            this.bezierHashMap.put(entity, list);
        }
        return list;
    }

    private set(entity: Entity, bezierList: BezierCurve3D[]): void {
        this.bezierHashMap.put(entity, bezierList);
    }
}