# TINY TANKS

『はじめてのWii』の「タンク」を参考にしたブラウザ戦車ゲームです。Canvas 2Dで描画し、BGMはオリジナル曲をMaster Modの付属SoundFontで再生します。任天堂の公式作品ではありません。

- リポジトリ：[Edqrt/tiny-tanks](https://github.com/Edqrt/tiny-tanks)
- プレイ：[TINY TANKS](https://edqrt.github.io/tiny-tanks/)
- 操作・仕様・音楽の詳細：[操作・開発ガイド](docs/guide.md)

## フォルダー構成

この `Tanks/` がGitリポジトリのルートです。開発ソースをここで管理し、公開用ファイルはビルドで生成します。

```text
Tanks/
├── .github/workflows/  # テスト・ビルド・GitHub Pagesへの公開
├── src/               # ゲーム・エディタのHTML、CSS、JavaScript
├── scripts/           # 開発サーバー、ビルド、音楽関連のツール
├── tests/             # 自動テスト
├── docs/              # 操作・開発ガイド
├── references/        # ローカルのリファレンス音源・分析資料
├── artifacts/         # MIDI・WAV・配布用ZIP
├── dist/              # ビルドで生成する公開用ファイル
├── package.json
└── README.md
```

`dist/`・`artifacts/`・`references/`・`node_modules/` はGit管理の対象外です。実行に必要な音源は `src/music-bank.js` に埋め込まれているので、クローン後の起動・テスト・ビルドに `references/` は不要です。音源の再抽出時だけローカルのリファレンスを使います。

## 開発中の起動

Node.js 20以降を用意し、`Tanks/` で実行します。

```powershell
npm ci
npm start
```

<http://localhost:4173> を開きます。エディタは <http://localhost:4173/editor.html> です。終了は `Ctrl+C`。ポートは `$env:PORT = '4174'` で変更できます。

開発サーバーは `src/` を配信します。ソースの変更は再読み込みで反映され、エディタの「標準レベルに保存」は `src/levels.js` に保存します。Live Serverを使う場合は `src/index.html` を開き、レベルの保存先にも `src/levels.js` を選んでください。

## テスト・ビルド・配布

```powershell
npm test
npm run build
```

`dist/index.html` をダブルクリックすると、Node.jsなしで遊べます。エディタは `dist/editor.html` です。`dist/` の中身をまとめて保持してください。生成済みファイルは直接編集せず、`src/` を変更して再ビルドします。

Windowsでは次のコマンドでビルドと配布用ZIPの作成をまとめて行えます。

```powershell
npm run package
```

出力先は `artifacts/releases/tiny-tanks-public.zip` です。このZIPには静的ファイルだけを含みます。展開して直接遊ぶか、静的ホスティングへ配置できます。開発を引き継ぐ場合はGitリポジトリをクローンしてください。

## GitHub Pagesへの公開

このリポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。既存リポジトリではこの設定を引き継ぎます。

`.github/workflows/pages.yml` が `npm ci` → `npm test` → `npm run build` を実行し、デフォルトブランチへのpush時に `dist/` だけを公開します。PRではテストとビルドを実行します。Actionsの **Publish Tiny Tanks → Run workflow** から手動実行もできます。

公開サイトのエディタではJSONの読み書きとブラウザへの下書き保存が使えます。標準レベルを更新する場合は、ローカルで `src/levels.js` を変更して再公開してください。

## 音楽関連のツール

```powershell
node scripts/export-original-music.mjs
python scripts/import-master-music.py
python scripts/analyze-music-rhythm.py
```

MIDIの出力先は `artifacts/audio/music-original.mid` です。音源の再抽出とリズム解析は `references/master-mod/` のローカル資料を使用します。再抽出は `src/music-bank.js` を生成し、オリジナル曲の譜面 `src/music-score.js` は上書きしません。詳細は[ガイド](docs/guide.md)を参照してください。
