
//lib_RTMApiCompatClient.jsの型定義ファイル

import { DisplayList } from "jp.ngt.ngtlib.renderer";

/**
 * RTMのバージョン差異を吸収するためのクラスです。RTMのバージョンによっては正常に動作しない機能もあります
 * 
 * 1.12と1.7.10の両方で動作するように設計されていますが、すべてのバージョンで完全な互換性があるわけではありません
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
}
