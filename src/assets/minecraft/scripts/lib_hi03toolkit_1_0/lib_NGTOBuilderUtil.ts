import { ArrayList, HashMap, List } from "java.util";
import { ItemMiniature } from "jp.ngt.mcte.item";
import { BlockSet, NGTObject } from "jp.ngt.ngtlib.block";
import { DataMap } from "jp.ngt.rtm.modelpack.state";
import { Block } from "net.minecraft.block";
import { Entity } from "net.minecraft.entity";
import { EntityPlayer } from "net.minecraft.entity.player";
import { ItemStack } from "net.minecraft.item";
import { NBTTagCompound } from "net.minecraft.nbt";
import { RTMApiCompat } from "./lib_RTMApiCompat";

export type Pos = [
    x: number,
    y: number,
    z: number
]

export type combineNGTOList = [
    ngto: NGTObject,
    offsetX: number,
    offsetY: number,
    offsetZ: number
] | null;

//### NGTOBuilderUtil ###
/**
 * 便利機能を提供するユーティリティクラス
 */
export class NGTOBuilderUtil {
    private static ngtoCache: HashMap<NBTTagCompound | string, NGTObject> = new HashMap();

    private static posListCache: HashMap<string, Pos[]> = new HashMap();

    /**
     * プレイヤーが手に持っているミニチュアブロックからNGTOを取得する
     * @param player 
     * @returns NGTO。取得できない場合はnull
     */
    static getHeldNGTO(player: EntityPlayer): NGTObject | null {
        const currrentItem = NGTOBuilderUtil.getHeldItem(player);
        const nbt = currrentItem.getTagCompound();
        const cachedNGTO = this.ngtoCache.get(nbt);
        if (cachedNGTO) return cachedNGTO;
        if (nbt && nbt.hasKey("BlocksData")) {
            const ngto = ItemMiniature.getNGTObject(nbt);
            this.ngtoCache.put(nbt, ngto);
            return ngto;
        }
        return null;
    }

    /**
     * プレイヤーのインベントリ内のすべてのミニチュアブロックからNGTOを取得する
     * @param player 
     * @returns NGTOの配列。ない場合は空の配列
     */
    static getAllInventoryNGTOs(player: EntityPlayer): NGTObject[] {
        const inventory = player.inventory;
        const ngtoList: NGTObject[] = [];
        for (let i = 0; i < inventory.mainInventory.length; i++) {
            const itemStack = inventory.mainInventory[i];
            if (itemStack) {
                const nbt = itemStack.getTagCompound();
                if (nbt) {
                    const cachedNGTO = this.ngtoCache.get(nbt);
                    if (cachedNGTO) {
                        ngtoList.push(cachedNGTO);
                        continue;
                    }
                    else if (nbt && nbt.hasKey("BlocksData")) {
                        const ngto = ItemMiniature.getNGTObject(nbt);
                        this.ngtoCache.put(nbt, ngto);
                        ngtoList.push(ngto);
                        continue;
                    }
                }
            }
        }
        return ngtoList;
    }

    /**
     * プレイヤーが手に持っているアイテムを取得する
     * @param player 
     * @returns アイテムスタック。取得できない場合はnull
     */
    static getHeldItem(player: EntityPlayer): ItemStack {
        const inventory = player.inventory;
        const index = inventory.currentItem;
        return RTMApiCompat.getItemStackAt(inventory, index);
    }

    /**
     * プレイヤーが手に持っているブロックのBlockSetを取得する
     * @param player 
     * @returns ブロックセット。取得できない場合はnull
     */
    static getHeldBlockSet(player: EntityPlayer): BlockSet | null {
        const itemStack: ItemStack = this.getHeldItem(player);
        if (itemStack) {
            const itemBlock = Block.getBlockFromItem(itemStack.getItem());
            if (itemBlock instanceof Block) {
                const itemMetadata = itemStack.getItemDamage();
                const itemNBT = itemStack.getTagCompound();
                return new BlockSet(itemBlock, itemMetadata, itemNBT);
            }
        }
        return null;
    }

    /**
     * BlockSetと相対座標リストからNGTOを作成する
     * @param blockSet 
     * @param relativePosList 相対座標リスト [[x, y, z], ...]
     */
    static createNGTO(blockSet: BlockSet, relativePosList: Pos[]): NGTObject {
        if (relativePosList.length === 0) relativePosList = [[0, 0, 0]];
        let minX = relativePosList[0][0];
        let minY = relativePosList[0][1];
        let minZ = relativePosList[0][2];
        let maxX = relativePosList[0][0];
        let maxY = relativePosList[0][1];
        let maxZ = relativePosList[0][2];
        //relativePosListから必要サイズを計算
        for (let i = 0; i < relativePosList.length; i++) {
            const pos = relativePosList[i];
            const x = pos[0];
            const y = pos[1];
            const z = pos[2];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (z < minZ) minZ = z;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (z > maxZ) maxZ = z;
        }
        // 最小座標が0になるように補正
        const offsetX = -minX;
        const offsetY = -minY;
        const offsetZ = -minZ;

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        const depth = maxZ - minZ + 1;

        const total = width * height * depth;
        const list: List<BlockSet> = new ArrayList();
        // まず全部AIRで埋める
        for (let i = 0; i < total; i++) {
            list.add(BlockSet.AIR);
        }
        // relativePosListにある座標だけblockSetで上書き
        for (let i = 0; i < relativePosList.length; i++) {
            const pos = relativePosList[i];
            const x = pos[0] + offsetX;
            const y = pos[1] + offsetY;
            const z = pos[2] + offsetZ;
            //範囲外はスキップ
            if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) continue;
            const index = (x * height + y) * depth + z;
            list.set(index, blockSet);
        }
        return NGTObject.createNGTO(list, width, height, depth, Math.floor(width / 2), 0, Math.floor(depth / 2));
    }

    /**
     * NGTOをキャッシュする
     * @param entity 
     * @param key 
     * @param ngto 
     */
    static setNGTOCache(entity: Entity, key: string, ngto: NGTObject): void {
        this.ngtoCache.put(`${entity.getEntityId()}_${key}`, ngto);
    }

    /**
     * キャッシュされたNGTOを取得する
     * @param entity 
     * @param key 
     * @returns 
     */
    static getNGTOCache(entity: Entity, key: string): NGTObject | null {
        const cached = this.ngtoCache.get(`${entity.getEntityId()}_${key}`);
        if (cached) return cached;
        return null;
    }

    /**
     * 直径と高さから、中身が詰まった円柱のrelativePosListを作る。
     * @param diameter 円柱の直径。ブロック数
     * @param height 円柱の高さ。ブロック数
     * @returns [[x, y, z], ...] ブロックを構成する配列(relativePosList)
     */
    static createCylinderPosList(diameter: number, height: number): Pos[] {
        const posList: Pos[] = [];
        if (diameter <= 0 || height <= 0) return posList;
        const radius = diameter / 2;
        // ブロック中心基準で円判定する
        const center = (diameter - 1) / 2;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < diameter; x++) {
                for (let z = 0; z < diameter; z++) {
                    const dx = x - center;
                    const dz = z - center;
                    const distanceSq = dx * dx + dz * dz;
                    if (distanceSq <= radius * radius) {
                        posList.push([x, y, z]);
                    }
                }
            }
        }
        return posList;
    }

    /**
     * 幅と高さから、中身が詰まった正方形断面の箱を作る。
     * @param width 幅。x方向・z方向のブロック数
     * @param height 高さ。y方向のブロック数
     * @returns [[x, y, z], ...] ブロックを構成する配列(relativePosList)
     */
    static createBoxPosList(width: number, height: number): Pos[] {
        const posList: Pos[] = [];
        if (width <= 0 || height <= 0) return posList;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                for (let z = 0; z < width; z++) {
                    posList.push([x, y, z]);
                }
            }
        }
        return posList;
    }

    /**
     * 連想配列/配列をJson文字列に変換してdataMapを経由してサーバー/クライアント側に送る
     * @param dataMap 
     * @param key 
     * @param object 連想配列もしくは配列
     */
    static sendJsonData(dataMap: DataMap, key: string, object: Object): void {
        const json = JSON.stringify(object).replace(/,/g, "☆");
        const val = dataMap.getString(key);
        if (val !== json) dataMap.setString(key, json, 1);
    }

    /**
     * 送られてきたJson文字列を連想配列/配列に変換して取得する
     * @param dataMap 
     * @param key 
     * @returns 
     */
    static getJsonData<T>(dataMap: DataMap, key: string): T | null {
        const data = dataMap.getString(key).replace(/☆/g, ",");
        if (data === "") return null;
        try {
            return JSON.parse(data);
        }
        catch (e) {
            return null;
        }
    }

    /**
     * dataMapに保存されているJson文字列をリセットする（空文字にする）
     * @param dataMap 
     * @param key 
     */
    static resetJsonData(dataMap: DataMap, key: string): void {
        const data = dataMap.getString(key)
        if (data !== "") dataMap.setString(key, "", 1);
    }

    /**
     * NGTOを指定したオフセット分だけ移動した新しいNGTOを返す
     * @param ngto オフセットを加えるNGTO
     * @param offsetX 
     * @param offsetY 
     * @param offsetZ 
     * @returns 
     */
    static offsetNGTO(ngto: NGTObject, offsetX: number, offsetY: number, offsetZ: number): NGTObject {
        const oldW = ngto.xSize;
        const oldH = ngto.ySize;
        const oldD = ngto.zSize;

        const minX = Math.min(0, offsetX);
        const minY = Math.min(0, offsetY);
        const minZ = Math.min(0, offsetZ);

        const newW = oldW + Math.abs(offsetX);
        const newH = oldH + Math.abs(offsetY);
        const newD = oldD + Math.abs(offsetZ);

        const total = newW * newH * newD;
        const list: List<BlockSet> = new ArrayList();
        for (let i = 0; i < total; i++) {
            list.add(BlockSet.AIR);
        }

        for (let x = 0; x < oldW; x++) {
            for (let y = 0; y < oldH; y++) {
                for (let z = 0; z < oldD; z++) {
                    const blockSet = ngto.getBlockSet(x, y, z);
                    const nx = x + offsetX - minX;
                    const ny = y + offsetY - minY;
                    const nz = z + offsetZ - minZ;
                    if (nx < 0 || nx >= newW || ny < 0 || ny >= newH || nz < 0 || nz >= newD) continue;
                    const index = (nx * newH + ny) * newD + nz;
                    list.set(index, blockSet);
                }
            }
        }

        const anchorX = Math.floor(newW / 2);
        const anchorY = 0;
        const anchorZ = Math.floor(newD / 2);
        return NGTObject.createNGTO(list, newW, newH, newD, anchorX, anchorY, anchorZ);
    }

    /**
     * 複数のNGTOをオフセット付きで結合して新しいNGTOを作成する
     * @param ngtoList 
     * @returns 
     */
    static combineNGTO(ngtoList: combineNGTOList[]): NGTObject {//[[ngto, offsetX, offsetY, offsetZ], ...]
        if (ngtoList.length === 0) return NGTOBuilderUtil.createNGTO(BlockSet.AIR, [[0, 0, 0]]);

        // 結合後の境界を計算
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let minZ = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let maxZ = Number.NEGATIVE_INFINITY;

        for (let i = 0; i < ngtoList.length; i++) {
            const entry = ngtoList[i];
            if (!entry) continue;
            const ngto = entry[0];
            const offsetX = entry[1];
            const offsetY = entry[2];
            const offsetZ = entry[3];
            if (!ngto) continue;
            minX = Math.min(minX, offsetX);
            minY = Math.min(minY, offsetY);
            minZ = Math.min(minZ, offsetZ);
            maxX = Math.max(maxX, offsetX + ngto.xSize - 1);
            maxY = Math.max(maxY, offsetY + ngto.ySize - 1);
            maxZ = Math.max(maxZ, offsetZ + ngto.zSize - 1);
        }

        const newW = Math.max(1, Math.floor(maxX - minX + 1));
        const newH = Math.max(1, Math.floor(maxY - minY + 1));
        const newD = Math.max(1, Math.floor(maxZ - minZ + 1));

        const total = newW * newH * newD;
        const list: List<BlockSet> = new ArrayList();
        for (let i = 0; i < total; i++) list.add(BlockSet.AIR);

        // 各NGTOのブロックを新しいリストにコピー
        for (let i = 0; i < ngtoList.length; i++) {
            const entry = ngtoList[i];
            if (!entry) continue;
            const ngto = entry[0];
            const offsetX = entry[1];
            const offsetY = entry[2];
            const offsetZ = entry[3];
            if (!ngto) continue;
            for (let x = 0; x < ngto.xSize; x++) {
                for (let y = 0; y < ngto.ySize; y++) {
                    for (let z = 0; z < ngto.zSize; z++) {
                        const bs = ngto.getBlockSet(x, y, z);
                        const tx = offsetX + x - minX;
                        const ty = offsetY + y - minY;
                        const tz = offsetZ + z - minZ;
                        if (tx < 0 || tx >= newW || ty < 0 || ty >= newH || tz < 0 || tz >= newD) continue;
                        const index = (tx * newH + ty) * newD + tz;
                        list.set(index, bs);
                    }
                }
            }
        }

        const anchorX = Math.floor(newW / 2);
        const anchorY = 0;
        const anchorZ = Math.floor(newD / 2);
        return NGTObject.createNGTO(list, newW, newH, newD, anchorX, anchorY, anchorZ);
    }

    /**
     * NGTOと設置座標から、NGTOのブロックが設置されるワールド座標のリストを作成する
     * @param ngto 
     * @param placeX 
     * @param placeY 
     * @param placeZ 
     * @returns 
     */
    static createExpectedPosList(ngto: NGTObject, placeX: number, placeY: number, placeZ: number, isIgnoreAir: boolean): Pos[] {
        const ngtoHash = this.getNGTOHash(ngto);
        const key = `${ngtoHash}_${placeX}_${placeY}_${placeZ}`;
        const posList: Pos[] = [];
        if (!ngto) return posList;

        //キャッシュがある場合はそちらを使う
        const cached = this.posListCache.get(key);
        if (cached) return cached;

        //キャッシュがない場合は新たに作成する
        const origX = ngto.origX;
        const origY = ngto.origY;
        const origZ = ngto.origZ;
        for (let x = 0; x < ngto.xSize; x++) {
            for (let y = 0; y < ngto.ySize; y++) {
                for (let z = 0; z < ngto.zSize; z++) {
                    const blockSet = ngto.getBlockSet(x, y, z);
                    if (!blockSet) continue;
                    const id = Block.getIdFromBlock(blockSet.block);
                    if (id === 0 && isIgnoreAir) continue;
                    posList.push([placeX + x - origX, placeY + y - origY, placeZ + z - origZ]);
                }
            }
        }
        this.posListCache.put(key, posList);
        return posList;
    }

    /**
     * NGTOのハッシュを計算する。NGTOのサイズから計算する簡易的なハッシュ関数で、同じサイズのNGTOは同じハッシュになる。
     * @param ngto 
     * @returns 
     */
    static getNGTOHash(ngto: NGTObject): number {
        return ngto.xSize << 20 & 0x400 | ngto.ySize << 10 & 0x400 | ngto.zSize & 0x400;
    }

    /**
     * rtm-ts用
     * Javaのクラスオブジェクトを取得する。引数にはクラスのインスタンスもしくはクラスオブジェクトを渡すことができる。
     * @param javaType 
     * @returns 
     */
    static getJavaClass<T>(javaType: T): any {
        return (javaType as any).class;
    }
}