# TINY TANKS

ブラウザ戦車ゲームの公開用ファイルです。Node.jsを使わずに公開・プレイできます。

## GitHub Pagesで公開する

1. GitHubで新しいPublicリポジトリを作成します。名前は `tiny-tanks` などにします。
2. このZIPを展開し、`index.html` と `.github` フォルダーがリポジトリ直下になるよう、中身をアップロードします。ZIPそのものはアップロードしません。
3. **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
4. **Actions → Publish Tiny Tanks → Run workflow** で実行します。
5. 成功すると **Settings → Pages** またはActionsの `github-pages` に公開URLが表示されます。

公開URLは通常 `https://ユーザー名.github.io/リポジトリ名/` です。
エディタ・JSONの読み書き・ローカル保存は利用できます。標準レベルへのサーバー保存には対応しません。

HTMLを直接開く場合は、同じフォルダーのJavaScript・CSSもまとめて保持してください。
BGMはオリジナル曲をMaster Modの制作者が配布したSoundFontで再生します。任天堂の公式作品ではありません。