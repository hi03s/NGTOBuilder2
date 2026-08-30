# 樹木ブラシの外部プリセット

別のRTMモデルパックから、NGTO Builder 2の樹木ブラシへプリセットを追加できます。  
通常のモデルパックと同様にmodsフォルダに入れることで有効化できます。  

[サンプルパック](../samples/tree-brush-preset-pack/README.md)では、NGTZとNGTOを同じプリセットから読み込む構成を確認できます。

## ファイル構成

設定ファイルのファイル名を`*.ngtobtree.json`とし、NGTZまたはNGTOと同じフォルダへ配置してください。

```text
ExternalTreePack.zip
└─ assets/minecraft/scripts/ngtobuilder2/brush/presets/
   ├─ example_forest.ngtobtree.json
   ├─ example_forest.ngtz
   └─ single_tree.ngto
```

## 設定ファイル
↓基本構成↓
```json
{
  "format": 1,
  "id": "example:forest",
  "name": "追加の森林",
  "blocks": [
    "example_forest.ngtz",
    "single_tree.ngto"
  ],
  "modid": ["ExampleMod"],
  "order": 1000
}
```
  
↓最小構成↓
```json
{
  "id": "example:forest",
  "name": "追加の森林",
  "blocks": [
    "example_forest.ngtz",
    "single_tree.ngto"
  ]
}
```

- `format`: 設定ファイル形式。現在は`1`（任意）
- `id`: 全モデルパックを通して一意な小文字ID（必須）
- `name`: Pキー切替時に表示する名前（必須）
- `blocks`: 同じフォルダを基準とする`.ngtz`／`.ngto`の相対パス（必須）
- `modid`: NGTO/NGTZにModブロックを含む場合、必要なModのModIDを記載する。1つでも未導入なら選択肢から除外（任意）
- `order`: Pキーで表示する順序。省略時は`1000`（任意）

`id`には`example:forest`のような名前空間付きIDを指定してください。使用できる文字は小文字英数字、`_`、`.`、`-`、`/`です。既存プリセットとIDが重複した場合、外部プリセットは読み込まれません。

## 樹木データ作成時の注意点

- 樹木の高さをランダム化するため、NGTOの最下層（Y=0）のブロック層は生成時に0～2回追加で複製されます。幹以外のブロックを最下層へ含めると、それらも縦方向に複製されます。
- 樹木は生成時に0度、90度、180度、270度のいずれかへランダムに回転します。向きに依存するブロックや左右非対称の形状でも問題がないことを確認してください。

## 複数プリセットを1ファイルへ格納する場合

`presets`配列へ複数のプリセットを格納できます。

```json
{
  "format": 1,
  "presets": [
    {
      "id": "example:oak",
      "name": "追加オーク",
      "blocks": ["oak.ngtz"],
      "order": 1000
    },
    {
      "id": "example:birch",
      "name": "追加シラカバ",
      "blocks": ["birch.ngto"],
      "order": 1001
    }
  ]
}
```

## 導入と読込

- 外部プリセットはゲーム起動時に読み込まれます。追加・変更後はゲームを再起動してください。
- 不正な設定ファイル、欠落ファイル、未対応拡張子、重複IDを含むプリセットは個別にスキップされます。
- マルチプレイでは、同じ外部プリセットパックをクライアントとサーバーの両方へ導入してください。
- クライアントとサーバーの内容が一致しない場合、誤生成防止のため樹木の生成と消去が無効になります。
