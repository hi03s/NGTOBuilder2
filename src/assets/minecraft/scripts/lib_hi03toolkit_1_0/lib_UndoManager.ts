import { HashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { BlockBuilder } from "./lib_BlockBuilder";

export class UndoManager {
    private static hashMap: HashMap<Entity, BlockBuilder[]> = new HashMap();

    static push(entity: Entity, blockBuilder: BlockBuilder): void {
        const list = this.getList(entity);
        list.push(blockBuilder);
        this.setList(entity, list);
    }

    static pop(entity: Entity): BlockBuilder | null {
        const list = this.getList(entity);
        const result = list.pop();
        this.setList(entity, list);
        return result ? result : null;
    }

    static updateLastData(entity: Entity, blockBuilder: BlockBuilder): void {
        const list = this.getList(entity);
        if (list.length === 0) list.push(blockBuilder);
        else list[list.length - 1] = blockBuilder;
        this.setList(entity, list);
    }

    static getLastData(entity: Entity): BlockBuilder | null {
        const list = this.getList(entity);
        if (list.length === 0) return null;
        return list[list.length - 1];
    }

    static clear(entity: Entity): void {
        this.setList(entity, []);
    }

    private static getList(entity: Entity): BlockBuilder[] {
        const list = this.hashMap.get(entity) || [];
        return list;
    }

    private static setList(entity: Entity, list: BlockBuilder[]): void {
        this.hashMap.put(entity, list);
    }

}