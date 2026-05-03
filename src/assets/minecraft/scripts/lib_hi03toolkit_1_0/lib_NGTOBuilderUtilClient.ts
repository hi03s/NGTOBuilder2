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
import { FloatBuffer } from "java.nio";
import { Quaternion } from "./lib_Quaternion";
import { BufferUtils } from "org.lwjgl";
import { System } from "java.lang";
import { NGTObject } from "jp.ngt.ngtlib.block";
import { RotatableBlockSet } from "./lib_RotatableBlockObject";
import { OpenGlHelper } from "net.minecraft.client.renderer";

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

    private static bufferCache: HashMap<string, FloatBuffer> = new HashMap();

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
        if (optionKeyDown) {
            const prevKeyDown = dataMap.getBoolean(`prevKeyDown_${keyCode}`);
            const isKeyDown = Keyboard.isKeyDown(keyCode);
            if (prevKeyDown !== isKeyDown) dataMap.setBoolean(`prevKeyDown_${keyCode}`, isKeyDown, 0);
            return !prevKeyDown && isKeyDown;
        }
        return false;
    }

    /**
     * キーが押され続けていることを検知する
     * @param dataMap 
     * @param keyCode 
     * @param requiredMillis 押され続けているとみなすために必要な時間[ms]
     * @returns 
     */
    static isKeyDownLong(dataMap: DataMap, keyCode: number, requiredMillis: number): boolean {
        const now = System.currentTimeMillis();
        let pressStart = Number(dataMap.getString(`keyDownStartTime_${keyCode}`));
        if (Keyboard.isKeyDown(keyCode)) {
            if (pressStart === 0) {
                pressStart = now;
                dataMap.setString(`keyDownStartTime_${keyCode}`, String(pressStart), 0);
            }
            return (now - pressStart) >= requiredMillis;
        }
        if (pressStart !== 0) dataMap.setString(`keyDownStartTime_${keyCode}`, "0", 0);
        return false;
    }

    static getOutsideFramePosList(ngto: NGTObject): Pos[] {
        const blockSetList: Pos[] = [];
        const maxX = ngto.xSize;
        const maxY = ngto.ySize;
        const maxZ = ngto.zSize;
        const yzList = [[0, 0], [0, maxZ], [maxY, 0], [maxY, maxZ]];
        for (let xIdx = 0; xIdx < ngto.xSize; xIdx++) {
            yzList.forEach(function (posYZ) {
                blockSetList.push([xIdx, posYZ[0], posYZ[1]]);
            });
        }
        const xyList = [[0, 0], [maxX, 0], [0, maxY], [maxX, maxY]];
        for (let zIdx = 0; zIdx < ngto.zSize; zIdx++) {
            xyList.forEach(function (posXY) {
                blockSetList.push([posXY[0], posXY[1], zIdx]);
            });
        }
        const xzList = [[0, 0], [maxX, 0], [0, maxZ], [maxX, maxZ]];
        for (let yIdx = 0; yIdx < ngto.ySize; yIdx++) {
            xzList.forEach(function (posXZ) {
                blockSetList.push([posXZ[0], yIdx, posXZ[1]]);
            });
        }
        return blockSetList;
    }

    /**
     * ブロックを設置する座標にフレームを描画する(キャッシュ化によるStatic描画)
     * 20000ブロックを超えるフレームは描画できません
     * @param renderer 
     * @param entity 
     * @param posList 
     */
    static renderPlaceBlocksStatic(renderer: PartsRenderer, partName: string, entity: Entity, posList: Pos[]): void {
        if (posList.length <= 20000) {
            //posListをハッシュ化
            const posListHash = Arrays.deepHashCode(posList);
            const key = `${entity.getUniqueID()}_${posListHash}`;
            const glList = NGTOBuilderUtilClient.glCache.get(key);
            if (!glList) {
                const glList = RTMApiCompatClient.generateGLList();
                GL11.glPushMatrix();
                GLHelper.startCompile(glList);

                posList.forEach(pos => {
                    GL11.glPushMatrix();
                    GL11.glTranslated(pos[0], pos[1], pos[2]);
                    NGTOBuilderUtilClient.renderStaticPart(renderer, partName);
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

    /**
     * クォータニオンをOpenGLの行列に変換して適用する。キャッシュ化による高速化も行う。
     * @param q クォータニオン
     */
    static glApplyQuaternionMatrix(q: Quaternion): void {
        const matrix = Quaternion.applyQuaternion(q);
        const key = NGTOBuilderUtilClient.createMatrixKey(matrix);
        const cache = this.bufferCache.get(key);
        if (cache) {
            GL11.glMultMatrix(cache);
        }
        else {
            const buffer = BufferUtils.createFloatBuffer(16);
            buffer.clear();
            matrix.forEach(v => { buffer.put(v) });
            buffer.flip();
            this.bufferCache.put(key, buffer);
            GL11.glMultMatrix(buffer);
        }
    }

    /**
     * NGTOを描画する
     * @param renderer 
     * @param ngto 
     * @param pass 
     */
    static renderNGTO(updateCache: boolean, entity: Entity, renderer: PartsRenderer, ngto: NGTObject, pass: number): void {
        const key = `${entity.getEntityId()}_${NGTOBuilderUtil.getNGTOHash(ngto)}`;
        const glList = NGTOBuilderUtilClient.glCache.get(key);
        if (!glList || updateCache) {
            const glList = RTMApiCompatClient.generateGLList();
            GL11.glPushMatrix();
            GLHelper.startCompile(glList);

            RTMApiCompatClient.renderNGTO(renderer, ngto, pass);

            GLHelper.endCompile();
            GL11.glPopMatrix();

            NGTOBuilderUtilClient.glCache.put(key, glList);
        }
        else {
            GLHelper.callList(glList);
        }
    }

    static enableAlpha(alpha: number): void {
        GL11.glDisable(GL11.GL_ALPHA_TEST);
        GL11.glEnable(GL11.GL_BLEND);
        OpenGlHelper.glBlendFunc(GL11.GL_SRC_ALPHA, GL11.GL_ONE_MINUS_SRC_ALPHA, 1, 0);
        GL11.glColor4f(1.0, 1.0, 1.0, alpha);
    }

    static disableAlpha(): void {
        GL11.glColor4f(1.0, 1.0, 1.0, 1.0);
        GL11.glDisable(GL11.GL_BLEND);
        GL11.glEnable(GL11.GL_ALPHA_TEST);
    }

    private static createMatrixKey(matrix: number[]): string {
        let key = "";
        for (let i = 0; i < matrix.length; i++) {
            const value = Math.round(matrix[i] * 1000000) / 1000000;
            if (i > 0) key += ",";
            key += value;
        }
        return key;
    }
}