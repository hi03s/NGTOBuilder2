import { DataMap } from "jp.ngt.rtm.modelpack.state";
import { Keyboard } from "org.lwjgl.input";
import { RTMApiCompatClient } from "./lib_RTMApiCompatClient";
import { Arrays, HashMap } from "java.util";
import { Entity } from "net.minecraft.entity";
import { GL11 } from "org.lwjgl.opengl";
import { DisplayList, GLHelper, NGTRenderHelper } from "jp.ngt.ngtlib.renderer";
import { ModelObject, Parts, PartsRenderer, RailPartsRenderer, VehiclePartsRenderer } from "jp.ngt.rtm.render";
import { NGTUtil, NGTUtilClient } from "jp.ngt.ngtlib.util";
import { ModelSetRail, ModelSetRailClient, ModelSetVehicleBaseClient } from "jp.ngt.rtm.modelpack.modelset";
import { NGTOBuilderUtil } from "./lib_NGTOBuilderUtil";
import { FloatBuffer } from "java.nio";
import { Quaternion } from "./lib_Quaternion";
import { BufferUtils } from "org.lwjgl";
import { System } from "java.lang";
import { NGTObject } from "jp.ngt.ngtlib.block";
import { OpenGlHelper } from "net.minecraft.client.renderer";
import { RailMap } from "jp.ngt.rtm.rail.util";
import { RTMApiCompat } from "./lib_RTMApiCompat";
import { NGTLog } from "jp.ngt.ngtlib.io";
import { BezierCurve3D } from "./lib_BezierCurve3D";
import { ModelPackManager } from "jp.ngt.rtm.modelpack";
import { Invocable, ScriptEngine, ScriptEngineManager } from "javax.script";
import { ResourceLocation } from "net.minecraft.util";
import { TileEntityLargeRailBase, TileEntityLargeRailCore } from "jp.ngt.rtm.rail";
import { ReflectionHelper } from "cpw.mods.fml.relauncher";

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

    private static renderRailMapCache: HashMap<string, [DisplayList, string]> = new HashMap();

    private static scriptEngineCache: HashMap<string, Invocable> = new HashMap();

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
    static isKeyDown(dataMap: DataMap, name: string, keyCode: number): boolean {
        const prevKeyDown = dataMap.getBoolean(`prevKeyDown_${name}`);
        const isKeyDown = Keyboard.isKeyDown(keyCode);
        if (prevKeyDown !== isKeyDown) dataMap.setBoolean(`prevKeyDown_${name}`, isKeyDown, 0);
        return !prevKeyDown && isKeyDown;
    }

    /**
     * キーが押され続けていることを検知する
     * @param dataMap 
     * @param keyCode 
     * @param requiredMillis 押され続けているとみなすために必要な時間[ms]
     * @returns 
     */
    static isKeyDownLong(dataMap: DataMap, name: string, keyCode: number, requiredMillis: number): boolean {
        const now = System.currentTimeMillis();
        let pressStart = Number(dataMap.getString(`keyDownStartTime_${name}`));
        if (Keyboard.isKeyDown(keyCode)) {
            if (pressStart === 0) {
                pressStart = now;
                dataMap.setString(`keyDownStartTime_${name}`, String(pressStart), 0);
            }
            return (now - pressStart) >= requiredMillis;
        }
        if (pressStart !== 0) dataMap.setString(`keyDownStartTime_${name}`, "0", 0);
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

    static renderRailMapHighlight(entity: Entity, railMap: RailMap, colorCode: string, alpha: number): void {
        const startRP = railMap.getStartRP();
        const endRP = railMap.getEndRP();
        const tile = RTMApiCompat.getTileEntity(entity.worldObj, startRP.blockX, startRP.blockY, startRP.blockZ);
        if (tile instanceof TileEntityLargeRailBase && tile.getRailCore()) {
            const railCore = tile.getRailCore();
            const property = railCore.getProperty();
            const modelName = property.railModel;
            const hashKey =
                `${startRP.blockX}_${startRP.blockY}_${startRP.blockZ}_${RTMApiCompat.getHorizontalAnchorYaw(startRP)}_${RTMApiCompat.getHorizontalAnchorLength(startRP)}
                _${endRP.blockX}_${endRP.blockY}_${endRP.blockZ}_${RTMApiCompat.getHorizontalAnchorYaw(endRP)}_${RTMApiCompat.getHorizontalAnchorLength(endRP)}
                _${modelName}`;

            let cachedData = this.renderRailMapCache.get(hashKey);//[displayList, railModelName]
            if (!cachedData || cachedData[1] !== modelName) {
                const modelSet = railCore.getProperty().getModelSet() as ModelSetRailClient;
                const railRenderer = modelSet.model.renderer as RailPartsRenderer;
                const glList = RTMApiCompatClient.generateGLList();
                cachedData = [glList, modelName];
                this.renderRailMapCache.put(hashKey, cachedData);
                const shouldRenderObject =
                    ReflectionHelper.findMethod(
                        NGTOBuilderUtil.getJavaClass(RailPartsRenderer),
                        railRenderer,
                        ["shouldRenderObject"],
                        [
                            NGTOBuilderUtil.getJavaClass(TileEntityLargeRailCore),
                            NGTOBuilderUtil.getJavaClass(java.lang.String),
                            java.lang.Integer.TYPE,
                            java.lang.Integer.TYPE
                        ]);
                const groupObjects = modelSet.model.model.getGroupObjects();
                //描画
                GLHelper.startCompile(glList);
                GL11.glPushMatrix();
                const split = Math.floor(railMap.getLength() * 2);
                const len = java.lang.Integer.valueOf(split);
                for (let rmIdx = 0; rmIdx < split; rmIdx++) {
                    const pos = railMap.getRailPos(split, rmIdx);//絶対座標
                    const posY = railMap.getRailHeight(split, rmIdx);
                    const yaw = railMap.getRailYaw(split, rmIdx);
                    const pitch = RTMApiCompat.getRailPitch(railMap, split, rmIdx);
                    const roll = RTMApiCompat.getCant(railMap, split, rmIdx);
                    GL11.glPushMatrix();
                    GL11.glTranslatef(pos[1], posY, pos[0]);
                    GL11.glRotatef(yaw, 0, 1, 0);
                    GL11.glRotatef(pitch, 1, 0, 0);
                    GL11.glRotatef(roll, 0, 0, 1);
                    //## 描画 ##
                    for (let groupIdx = 0; groupIdx < groupObjects.size(); groupIdx++) {
                        const group = groupObjects.get(groupIdx);
                        const name = new java.lang.String(group.name);
                        const pos = java.lang.Integer.valueOf(rmIdx);
                        if (shouldRenderObject.invoke(railRenderer, railCore, name, len, pos) as boolean) {
                            NGTRenderHelper.renderCustomModel(modelSet.model.model, railRenderer.currentMatId, modelSet.getConfig().smoothing, group.name);
                        }
                    }
                    GL11.glPopMatrix();
                }
                GL11.glPopMatrix();
                GLHelper.endCompile();
            }
            else {
                //カラーコードをRGBAに変換
                let hex = colorCode;
                if (hex.charAt(0) === "#") hex = hex.substring(1);
                if (hex.length === 3) {
                    hex = hex.charAt(0) + hex.charAt(0) +
                        hex.charAt(1) + hex.charAt(1) +
                        hex.charAt(2) + hex.charAt(2);
                }
                const color = parseInt(hex, 16);
                const r = ((color >> 16) & 0xFF) / 255;
                const g = ((color >> 8) & 0xFF) / 255;
                const b = (color & 0xFF) / 255;
                const a = Math.min(Math.max(alpha, 0), 1);

                //色を重ねる
                GL11.glEnable(GL11.GL_BLEND);
                GL11.glBlendFunc(GL11.GL_SRC_ALPHA, GL11.GL_ONE_MINUS_SRC_ALPHA);
                GL11.glDisable(GL11.GL_TEXTURE_2D);
                GL11.glColor4f(r, g, b, a);

                //描画
                GLHelper.callList(cachedData[0]);

                //復元
                GL11.glEnable(GL11.GL_TEXTURE_2D);
                GL11.glDisable(GL11.GL_BLEND);
                GL11.glColor4f(1.0, 1.0, 1.0, 1.0);
            }
        }
    }

    /**
     * ブロックを設置する座標にフレームを描画する(キャッシュ化によるStatic描画)
     * 20000ブロックを超えるフレームは描画できません
     * @param renderer 
     * @param entity 
     * @param posList 
     */
    static renderPosListStatic(renderer: PartsRenderer, parts: Parts, entity: Entity, posList: Pos[], forceRender:boolean = false): void {
        if (posList.length <= 20000 || forceRender) {
            //posListをハッシュ化
            const partsNames = parts.objNames;
            let partsKey = partsNames[0];
            for (let i = 1; i < partsNames.length; i++) {
                partsKey += "," + partsNames[i];
            }
            const posListHash = Arrays.deepHashCode(posList);
            const key = `${entity.getUniqueID()}_${partsKey}_${posListHash}`;
            const glList = NGTOBuilderUtilClient.glCache.get(key);
            if (!glList) {
                const glList = RTMApiCompatClient.generateGLList();
                GLHelper.startCompile(glList);
                GL11.glPushMatrix();

                posList.forEach(pos => {
                    GL11.glPushMatrix();
                    GL11.glTranslated(pos[0], pos[1], pos[2]);
                    NGTOBuilderUtilClient.renderStaticParts(renderer, parts);
                    GL11.glPopMatrix();
                });

                GL11.glPopMatrix();
                GLHelper.endCompile();

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
    static renderStaticParts(renderer: PartsRenderer, parts: Parts): void {
        const modelSet: ModelSetVehicleBaseClient = NGTUtil.getField(NGTOBuilderUtil.getJavaClass(PartsRenderer), renderer, "modelSet");
        const modelObj: ModelObject = NGTUtil.getField(NGTOBuilderUtil.getJavaClass(PartsRenderer), renderer, "modelObj");
        const smoothing = modelSet.getConfig().smoothing;
        const model = modelObj.model;
        const currentMatId = renderer.currentMatId;
        const partsNames = parts.objNames;
        for (let i = 0; i < partsNames.length; i++) {
            NGTRenderHelper.renderCustomModel(model, currentMatId, smoothing, partsNames[i]);
        }
    }

    static renderRailMapStatic(renderer: PartsRenderer, parts: Parts, railMap: RailMap, interval:number = 1): void {
        const startRP = railMap.getStartRP();
        const endRP = railMap.getEndRP();
        const partsNames = parts.objNames;//Java String[]
        let joindNames = partsNames[0];
        for (let i = 1; i < partsNames.length; i++) {
            joindNames += "," + partsNames[i];
        }
        const hashKey =
            `${startRP.blockX}_${startRP.blockY}_${startRP.blockZ}_${RTMApiCompat.getHorizontalAnchorYaw(startRP)}_${RTMApiCompat.getHorizontalAnchorLength(startRP)}
            _${endRP.blockX}_${endRP.blockY}_${endRP.blockZ}_${RTMApiCompat.getHorizontalAnchorYaw(endRP)}_${RTMApiCompat.getHorizontalAnchorLength(endRP)}
            _${joindNames}`;
        let cachedData = this.renderRailMapCache.get(hashKey);//[displayList, railModelName]
        if (!cachedData) {
            const glList = RTMApiCompatClient.generateGLList();
            cachedData = [glList, ""];
            this.renderRailMapCache.put(hashKey, cachedData);
            GLHelper.startCompile(glList);
            GL11.glPushMatrix();
            const split = Math.floor(railMap.getLength() * 2);
            if (interval < 1) interval = 1;
            for (let idx = 0; idx < split; idx += interval) {
                const pos = railMap.getRailPos(split, idx);//絶対座標
                const posY = railMap.getRailHeight(split, idx);
                const yaw = railMap.getRailYaw(split, idx);
                const pitch = RTMApiCompat.getRailPitch(railMap, split, idx);
                const roll = RTMApiCompat.getCant(railMap, split, idx);
                GL11.glPushMatrix();
                GL11.glTranslatef(pos[1], posY, pos[0]);
                GL11.glRotatef(yaw, 0, 1, 0);
                GL11.glRotatef(pitch, 1, 0, 0);
                GL11.glRotatef(roll, 0, 0, 1);
                NGTOBuilderUtilClient.renderStaticParts(renderer, parts);
                GL11.glPopMatrix();
            }
            GL11.glPopMatrix();
            GLHelper.endCompile();
        }
        else {
            GLHelper.callList(cachedData[0]);
        }
    }

    static renderBezierStatic(renderer: PartsRenderer, parts: Parts, bezier: BezierCurve3D, interval:number = 1): void {
        const posList = bezier.getControlPoints();
        const partsNames = parts.objNames;//Java String[]
        let joindNames = partsNames[0];
        for (let i = 1; i < partsNames.length; i++) {
            joindNames += "," + partsNames[i];
        }
        const hashKey =
            `${posList[0][0]}_${posList[0][1]}_${posList[0][2]}_${posList[1][0]}_${posList[1][1]}_${posList[1][2]}
            _${posList[2][0]}_${posList[2][1]}_${posList[2][2]}_${posList[3][0]}_${posList[3][1]}_${posList[3][2]}
            _${joindNames}`;
        let cachedData = this.renderRailMapCache.get(hashKey);//[displayList, railModelName]
        if (!cachedData) {
            const glList = RTMApiCompatClient.generateGLList();
            cachedData = [glList, ""];
            this.renderRailMapCache.put(hashKey, cachedData);
            GLHelper.startCompile(glList);
            GL11.glPushMatrix();
            const split = Math.floor(bezier.getLength() * 2);
            if (interval < 1) interval = 1;
            for (let idx = 0; idx <= split; idx += interval) {
                const pos = bezier.getPoint(split, idx);//絶対座標
                const yaw = bezier.getYaw(split, idx);
                const pitch = bezier.getPitch(split, idx);
                GL11.glPushMatrix();
                GL11.glTranslatef(pos[0], pos[1], pos[2]);
                GL11.glRotatef(-yaw, 0, 1, 0);
                GL11.glRotatef(-pitch, 1, 0, 0);
                NGTOBuilderUtilClient.renderStaticParts(renderer, parts);
                GL11.glPopMatrix();
            }
            GL11.glPopMatrix();
            GLHelper.endCompile();
        }
        else {
            GLHelper.callList(cachedData[0]);
        }
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