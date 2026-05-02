import { DataMap } from "jp.ngt.rtm.modelpack.state";
import { Keyboard } from "org.lwjgl.input";
import { RTMApiCompatClient } from "./lib_RTMApiCompatClient";
import { Arrays, HashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { GL11 } from "org.lwjgl.opengl";
import { DisplayList, GLHelper, NGTRenderHelper } from "jp.ngt.ngtlib.renderer";
import { ModelObject, PartsRenderer, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { NGTUtil } from "jp.ngt.ngtlib.util";
import { ModelSetVehicleBaseClient } from "jp.ngt.rtm.modelpack.modelset";
import { NGTOBuilderUtil } from "./lib_NGTOBuilderUtil";
import { NGTLog } from "jp.ngt.ngtlib.io";

export type Pos = [
    x: number,
    y: number,
    z: number
]

//### NGTOBuilderUtilClient ###
/**
 * クライアントサイドの便利機能を提供するユーティリティクラス
 */
export class NGTOBuilderUtilClient {

    private static glCache: HashMap<string, DisplayList> = new HashMap();

    /**
     * 視線の先の座標/ブロック座標/ブロック側面座標を取得する。
     * 
     * 視線の先の情報がない場合はnullを返す
     * 
     * @returns 
     * posX/posY/posZ - 視線の先の座標(小数点)
     * 
     * blockX/blockY/blockZ - 視線先のブロック座標(ブロックを壊すときの座標)
     * 
     * placeX/placeY/placeZ - 視線先のブロック面の座標(ブロックを設置するときの座標)
     * 
     * side - 視線先のブロック面がある方向 0:下 1:上 2:北 3:南 4:西 5:東
     * 
     */
    static getLookingPos() {
        //RTMApiCompatClientに移動
        return RTMApiCompatClient.getLookingPos();
    }

    /**
     * キーが押された瞬間を検知する
     * @param dataMap 
     * @param keyCode 検知したいキー
     * @param optionKeyCode 同時押しするキーを指定(省略可)
     * @returns 
     */
    static isKeyDown(dataMap: DataMap, keyCode: number, optionKeyCode?: number): boolean {
        let optionKeyDown = true;
        if (optionKeyCode !== undefined && optionKeyCode !== null) optionKeyDown = Keyboard.isKeyDown(optionKeyCode);
        const prevKeyDown = dataMap.getBoolean("prevKeyDown_" + keyCode);
        const isKeyDown = Keyboard.isKeyDown(keyCode);
        if (prevKeyDown !== isKeyDown) dataMap.setBoolean("prevKeyDown_" + keyCode, isKeyDown, 0);
        return !prevKeyDown && isKeyDown && optionKeyDown;
    }

    /**
     * ブロックを設置する座標にフレームを描画する(キャッシュ化によるStatic描画)
     * @param renderer 
     * @param entity 
     * @param posList 
     */
    static renderPlaceBlocksStatic(renderer: PartsRenderer, entity: Entity, posList: Pos[]): void {
        //posListをハッシュ化
        const posListHash = Arrays.deepHashCode(posList);
        const key = `${entity.getUniqueID()}_${posListHash}`;
        const glList = NGTOBuilderUtilClient.glCache.get(key);
        if (!glList) {
            const glList = RTMApiCompatClient.generateGLList();
            NGTLog.debug(`[NGTOBuilderUtilClient] Generate GLList: ${key}/${glList.value}`);
            GL11.glPushMatrix();
            GLHelper.startCompile(glList);

            posList.forEach(pos => {
                GL11.glPushMatrix();
                GL11.glTranslated(pos[0], pos[1], pos[2]);
                NGTOBuilderUtilClient.renderStaticPart(renderer, "renderStaticPart");
                GL11.glPopMatrix();
            });

            GLHelper.endCompile();
            GL11.glPopMatrix();

            NGTOBuilderUtilClient.glCache.put(key, glList);
        }
        else {
            GLHelper.callList(glList);
        }
    }

    /**
     * パーツをStatic描画するための関数
     * @param renderer 
     * @param partsName 
     */
    static renderStaticPart(renderer: PartsRenderer, partsName: string): void {
        const modelSet: ModelSetVehicleBaseClient = NGTUtil.getField(NGTOBuilderUtil.getJavaClass(PartsRenderer), renderer, "modelSet");
        const modelObj: ModelObject = NGTUtil.getField(NGTOBuilderUtil.getJavaClass(PartsRenderer), renderer, "modelObj");
        const smoothing = modelSet.getConfig().smoothing;
        const model = modelObj.model;
        const currentMatId = renderer.currentMatId;
        NGTRenderHelper.renderCustomModel(model, currentMatId, smoothing, partsName);
    }
}