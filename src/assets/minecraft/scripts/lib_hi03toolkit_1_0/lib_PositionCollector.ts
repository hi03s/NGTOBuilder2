import { HashMap } from "java.util";
import { Entity } from "net.minecraft.entity";

export type DuplicatePos = [
    key: string,
    x: number,
    y: number,
    z: number
]

export type Pos = [
    x: number,
    y: number,
    z: number
]

//###  PositionCollector  ###
/**
 * 複数の座標を保存するクラス。
 */
export class PositionCollector {
    private hashMap: HashMap<Entity, DuplicatePos[]>;

    constructor() {
        this.hashMap = new HashMap;
    }

    /**
     * 座標を追加する
     * @param entity 
     * @param pos 座標 [x, y, z]
     * @param allowDuplicates 重複する座標の追加を許可するかどうか（デフォルトはfalse）
     * @returns 
     */
    add(entity: Entity, pos: Pos, allowDuplicates: boolean = false): void {
        const posList = this.get(entity);
        const key = pos.join(",");
        if (!allowDuplicates) {
            for (let i = 0; i < posList.length; i++) {
                if (posList[i][0] === key) return;
            }
        }
        posList.push([key, pos[0], pos[1], pos[2]]);
    }

    /**
     * すべての座標を追加する
     * @param entity 
     * @param posList 座標リスト [[x, y, z], ...]
     * @param allowDuplicates 重複する座標の追加を許可するかどうか（デフォルトはfalse）
     */
    addAll(entity: Entity, posList: Pos[], allowDuplicates: boolean = false): void {
        posList.forEach(pos => this.add(entity, pos, allowDuplicates));
    }

    /**
     * 最後の座標を取得して削除する
     * @param entity 
     * @returns 座標 [x, y, z]
     */
    pop(entity: Entity): Pos | null {
        const posList = this.get(entity);
        if (posList.length === 0) return null;
        const pos = posList.pop();
        this.set(entity, posList);
        if (pos) return [pos[1], pos[2], pos[3]];
        return null;
    }

    /**
     * 最初の座標を取得して削除する
     * @param entity 
     * @returns 座標 [x, y, z]
     */
    shift(entity: Entity): Pos | null {
        const posList = this.get(entity);
        const pos = posList.shift();
        this.set(entity, posList);
        if (pos) return [pos[1], pos[2], pos[3]];
        return null;
    }

    /**
     * すべての座標を取得する
     * @param entity 
     * @returns 座標の配列 [[x, y, z], ...]
     */
    getAll(entity: Entity): Pos[] {
        const posList = this.get(entity);
        return posList.map(v => [v[1], v[2], v[3]]);
    }

    /**
     * すべての座標を消去する
     * @param entity 
     */
    clear(entity: Entity): void {
        this.set(entity, []);
    }

    private get(entity: Entity): DuplicatePos[] {
        let list = this.hashMap.get(entity);
        if (!list) {
            const newList: DuplicatePos[] = [];
            this.hashMap.put(entity, newList);
            return newList;
        }
        return list;
    }

    private set(entity: Entity, posList: DuplicatePos[]): void {
        this.hashMap.put(entity, posList);
    }
}