# 樹木・草花ブラシの外部プリセット

別のRTMモデルパックから、NGTO Builder 2の樹木ブラシへ樹木や草花のプリセットを追加できます。
通常のモデルパックと同様にmodsフォルダに入れることで有効化できます。

[サンプルパック](../samples/tree-brush-preset-pack/)では、NGTZとNGTOを同じプリセットから読み込む構成を確認できます。

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
  "randomHeight": true,
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
- `randomHeight`: 最下層の追加複製による高さのランダム化。`true`で有効、`false`で無効。省略時は`true`（任意）
- `order`: Pキーで表示する順序。省略時は`1000`（任意）

`id`には`example:forest`のような名前空間付きIDを指定してください。使用できる文字は小文字英数字、`_`、`.`、`-`、`/`です。既存プリセットとIDが重複した場合、外部プリセットは読み込まれません。

NGTO／NGTZのファイル名と`blocks`のパスには大文字も使用できます。ZIP内では大文字・小文字を区別するため、`blocks`には実際のファイル名と同じ表記を指定してください。

## 樹木・草花データ作成時の注意点

- `randomHeight`が`true`の場合、NGTOの最下層（Y=0）のブロック層は生成時に0～2回追加で複製されます。幹以外のブロックを最下層へ含めると、それらも縦方向に複製されます。
- 草花など高さを変えたくないプリセットでは`randomHeight`を`false`にしてください。
- 樹木や草花は生成時に0度、90度、180度、270度のいずれかへランダムに回転します。向きに依存するブロックや左右非対称の形状でも問題がないことを確認してください。

### 草花プリセットの例

```json
{
  "format": 1,
  "id": "example:wildflowers",
  "name": "野の花",
  "blocks": ["wildflowers.ngtz", "grass.ngto"],
  "randomHeight": false,
  "order": 1100
}
```

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
      "randomHeight": true,
      "order": 1000
    },
    {
      "id": "example:birch",
      "name": "追加シラカバ",
      "blocks": ["birch.ngto"],
      "randomHeight": true,
      "order": 1001
    }
  ]
}
```

## 導入と読込

- 外部プリセットはゲーム起動時に読み込まれます。追加・変更後はゲームを再起動してください。
- 存在しない、または読み込めないNGTO／NGTZは、そのファイルだけ生成対象から除外されます。ほかのファイルが読み込める場合は、それらだけで生成します。
- プリセット内の全NGTO／NGTZが読み込めない場合もプリセット自体は選択できますが、生成物はありません。
- 欠落したファイルがあるプリセットで生成すると、ツールを使用している間、そのプリセットについて最初の1回だけ警告と対象パスがチャット欄に表示されます。
- 不正な設定ファイル、未対応拡張子、重複IDを含むプリセットは個別にスキップされます。
- マルチプレイでは、同じ外部プリセットパックをクライアントとサーバーの両方へ導入してください。
- クライアントとサーバーの内容が一致しない場合、誤生成防止のため樹木の生成と消去が無効になります。
