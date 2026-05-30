
//lib_RTMApiCompatClient.jsの型定義ファイル

import { NGTObject } from "jp.ngt.ngtlib.block";
import { DisplayList } from "jp.ngt.ngtlib.renderer";
import { ModelSetBase, ModelSetRail, ModelSetRailClient } from "jp.ngt.rtm.modelpack.modelset";
import { TileEntityLargeRailCore } from "jp.ngt.rtm.rail";
import { ModelObject, RailPartsRenderer } from "jp.ngt.rtm.render";

/**
 * RTMのバージョン差異を吸収するためのクラスです。RTMのバージョンによっては正常に動作しない機能もあります
 * 
 * 1.7.10で動作するように設計されています
 * 
 * クライアントサイド専用の機能を提供します
 */
export class RTMApiCompatClient {
    static isOldVer: boolean;
    static getLookingPos(): {
        posX: number;
        posY: number;
        posZ: number;
        blockX: number;
        blockY: number;
        blockZ: number;
        placeX: number;
        placeY: number;
        placeZ: number;
        side: number;
    } | null;
    static generateGLList(): DisplayList;
    static renderNGTO(renderer: PartsRenderer, ngto: NGTObject, pass: number): void;
    static getRendererWithScript(resource: ResourceLocation, ...args: string[]): PartsRenderer;
    static getModelSetList<T extends ModelSetBase>(modelType: string): { [name: string]: T };
    static getRailModelSet(railCore: TileEntityLargeRailCore): ModelSetRailClient;
    static getRailName(railCore: TileEntityLargeRailCore): string;
    static getModelObject(modelSet: ModelSetBase): ModelObject;
}
