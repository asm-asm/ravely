# Ravelry 日本語検索

日本語の編み物用語を英語に置き換えて、Ravelryのパターンを検索する非公式アプリです。
既存のHTML/CSS/JavaScript UIとExpressを使用します。Node.js 24を使用してください。

## 現在の状態

- UI → `/api/search` → RavelryのBasic認証付き検索、結果変換、ページ送りを実装。
- GitHub Pages用の静的ファイル生成とGitHub Actions、Render用の設定を追加。
- 設定済みの認証情報で実APIの検索・詳細取得に成功。カテゴリ・編み方・言語・無料の複合検索とページ送りを確認済みです。
- 2026-09-22に公式APIページを取得したところ、ログイン画面へ転送されました。公式仕様本文・アプリごとの認証情報・利用条件の最終確認は未完了です。下記のAPI契約は実装上の前提で、認証後に照合してください。

## ローカル起動

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

http://localhost:3000 を開きます。既存の `.env` がある場合は上書きせず編集してください。
認証情報が空で `RAVELRY_MODE=auto` の場合、架空のデモ結果を表示します。

```powershell
npm test
```

テストは疑似上流レスポンスを使い、認証ヘッダー、検索語変換、レスポンス変換、ページ送り、CORS、入力検証、エラー処理を確認します。実APIへの疎通試験ではありません。

## 実APIの設定

1. Ravelryにログインし、[公式APIドキュメント](https://www.ravelry.com/api)と[アプリ管理](https://www.ravelry.com/pro/developer)を確認します。
2. 公開パターン検索だけを対象に、Basic Authのread-onlyアプリを用意します。読み取り専用アプリで発行されるBasic認証用のユーザー名・パスワードの組を確認してください。
3. `.env` またはホスティング先の環境変数に設定します。Ravelryへのログインパスワードは使用しません。

```dotenv
RAVELRY_MODE=live
RAVELRY_API_USERNAME=issued_basic_auth_username
RAVELRY_API_PASSWORD=issued_basic_auth_password
```

この実装は、上記2値を `username:password` としてBase64化し、HTTP Basic認証ヘッダーに入れます。Bearer認証やユーザーごとのOAuthは実装していません。個人アカウント操作も対象外です。
旧設定の `RAVELRY_API_BASE_URL` と `RAVELRY_API_TOKEN` は使用しません。

接続先は `https://api.ravelry.com/patterns/search.json` に固定し、`query`、`page`、`page_size=24` を送ります。秘密情報を別ホストへ送らないため、任意URLやリダイレクトは許可しません。

再起動後、`http://localhost:3000/api/search?q=shawl` で `source: "ravelry"` とパターンが返ることを確認します。401/403相当は `UPSTREAM_AUTH` となります。アプリ種別と発行された認証情報を公式画面で再確認してください。認証エラー時にモックへ切り替えることはありません。

### 動作モード

| 設定 | 動作 |
| --- | --- |
| `auto` | 両方の認証値が空ならデモ。両方あれば実API。片方のみなら503 |
| `mock` | 明示的なデモ |
| `live` | 実API。認証値不足は503 |
| 未指定 | `NODE_ENV=production` ではlive、それ以外ではauto |

### 結果の変換

| 上流APIの想定フィールド | `/api/search` のフィールド |
| --- | --- |
| `patterns[].id` | `items[].id` |
| `patterns[].name` | `items[].title` |
| `patterns[].designer.name` | `designer` と表示用 `description` |
| `patterns[].permalink` | Ravelryパターンページの `url` |
| `patterns[].first_photo.medium_url` / `small_url` | `image`。未取得時は「画像なし」 |
| `patterns[].free` | trueの場合のみ「無料」タグ |
| `paginator.results` | `total`。不明ならnull |

`query` は正規化した入力、`searchQuery` は辞書変換後の語です。`page`、`pageSize`、`hasNext`、`source` も返します。
言語・価格は `/patterns.json?ids=ID1+ID2` で表示中の最大24件をまとめて取得します。IDはスペース区切りをURLエンコードします（`+` 自体を `%2B` にしないこと）。`languages`、`price`、`currency`、`free` をカード表示に使用します。価格は通貨付きの掲載価格で、換算しません。詳細取得失敗時も検索結果を残し、`detailsWarning` と不明表示で知らせます。
HTTP 400は入力不正、503は未設定/上流の利用上限、504は検索・詳細取得を合わせて12秒のタイムアウト、502は認証・通信・形式エラーです。上流のエラー本文と秘密情報は返しません。

## 日本語検索の範囲

`src/ravelry.js` の辞書で、例として `ショール → shawl`、`帽子 → hat`、`ベビー セーター → baby sweater` を変換します。全角・半角と空白も正規化します。
辞書外の語はそのまま送ります。自然文や結果本文の翻訳は行いません。`初心者` などは検索語であり、難易度フィルターではありません。

## タグ検索

キーワードなしでもタグだけで検索できます。各グループで1つを選択でき、異なるグループはAND条件で組み合わせます。再クリックで解除、タグ変更時は1ページ目へ戻ります。
キーワード・タグとも未指定なら、写真付きのパターンを制作例の多い順（`sort=projects&photo=yes`）で6件ずつ表示します。検索条件を指定した場合は24件ずつです。初期表示も実APIを使用し、読み込み失敗は画面に表示します。

| APIパラメーター | 内容 | Ravelryへの送信名 |
| --- | --- | --- |
| `category` | ショール・帽子・靴下・セーター・カーディガン・マフラー | `pc` |
| `craft` | 棒針編み・かぎ針編み | `craft` |
| `language` | 日本語・英語・フランス語・ドイツ語 | `language` |
| `availability` | `free`（無料のみ） | `availability` |
| `weight` | 糸の太さ（Lace / Fingering / Sport / DK / Worsted / Aran / Bulky） | `weight` |
| `fit` | ベビー・子ども・大人 | `fit` |
| `pa` | とじはぎなし・トップダウン・輪編み・平編み・レース模様 | `pa` |

追加の3条件は「もっと絞り込む」にまとめています。糸の太さは日本の太さ分類と完全には対応しないため、Ravelryの分類名をそのまま表示します。

例: `/api/search?category=shawl-wrap&craft=knitting&language=ja&availability=free`
対応値は `public/filters.js` をUIとサーバーで共有します。無効な値や重複指定は400となります。
言語フィルターは複数の対応言語の中に選んだ言語が含まれるパターンを探します。価格・言語は購入時にRavelryで再確認してください。

## GitHub Pages + Renderで公開

### 1. GitHubリポジトリ

コードをGitHubへpushします。`.env` はGit対象外、認証情報はサーバーの環境変数だけに保存します。
`public/config.js`、ActionsのVariables、READMEへ秘密情報を入れないでください。

### 2. RenderのAPIサーバー

リポジトリの `render.yaml` をBlueprintとして使用するか、Web Serviceを作成します。

- Runtime: Node.js 24
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check: `/api/health`
- `NODE_ENV=production`
- `RAVELRY_MODE=live`
- `RAVELRY_API_USERNAME` / `RAVELRY_API_PASSWORD`: 発行された認証情報
- `CORS_ORIGINS=https://YOUR-NAME.github.io`: UIのオリジン。`/REPOSITORY/` は付けません。複数指定はカンマ区切り

公開URLの `/api/search?q=shawl` を開き、実結果を確認します。`/api/health` はプロセスの生存確認だけであり、認証成功を保証しません。
料金プランはRenderの作成画面で選択します。[Render公式手順](https://render.com/docs/deploy-node-express-app)

### 3. GitHub PagesのUI

1. リポジトリ Settings → Pages → Sourceを **GitHub Actions** に設定。
2. Settings → Secrets and variables → Actions → **Variables** に `API_BASE_URL` を追加。値は `https://YOUR-API.onrender.com` のようなAPIサーバーのHTTPSオリジンです。`/api` は付けません。
3. `main` へpush、または「Deploy frontend to GitHub Pages」を手動実行。

Actionsが `npm test` と `npm run build:pages` を実行し、`dist/` だけをPagesへ公開します。`public` フォルダーをPagesのブランチ公開先として直接選ぶ設定ではありません。別の既定ブランチを使用する場合は `pages.yml` の `branches` を変更してください。
スタイルとスクリプトは相対パスなので `https://YOUR-NAME.github.io/REPOSITORY/` でも動作します。
バックエンドURLの変更時は `API_BASE_URL` を更新し、Pagesワークフローを再実行します。
[GitHub公式のカスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

ローカルで公開ファイルを生成する場合:

```powershell
$env:API_BASE_URL = 'https://YOUR-API.onrender.com'
$env:SITE_URL = 'https://YOUR-NAME.github.io/REPOSITORY/'
npm run build:pages
```

## OGPと共有

`public/og.png` は組み込みのGPT画像生成で作成したSNS用画像です。生成指示は `docs/og-image-prompt.txt` に記録しています。
Pagesのビルドでは `SITE_URL` からcanonical・og:url・og:image・twitter:imageの絶対URLをHTMLへ書き込みます。Actionsでは `configure-pages` の `base_url` を自動利用するため、通常は追加の変数設定は不要です。公開画像はJavaScriptを実行しないクローラーでも取得できます。
ヘッダーの共有ボタンはWeb Share APIを優先し、非対応・失敗時はURLコピー、それもできなければ手動コピー用入力欄を表示します。共有のキャンセル時はコピーしません。
localhostのURLは外部には共有できません。SNSでのOGP表示はPages公開後に確認してください。

## 簡易アクセス解析

ローカルの管理画面はAPIサーバーの `/admin`（現在の開発サーバーでは http://localhost:3001/admin ）です。ループバックからの開発環境アクセスはトークンなしで表示できます。外部アクセス・本番環境では `.env` またはホストに設定した `ANALYTICS_ADMIN_TOKEN` を入力してください。トークンはURLやブラウザーのストレージへ保存しません。Render Blueprintでは管理トークンを自動生成します。管理画面はバックエンドのみで配信し、Pagesには含めません。

- ページ表示回数、成功した検索の1ページ目の回数、パターンへのリンククリック、検索で選択されたタグを集計。
- 初期表示・ページ送りは検索回数に含めません。再読み込み・管理者の利用は閲覧回数に含みます。ユニークユーザー数ではありません。
- UTC日付で直近30日を表示。最大90日分の日別カウンターを保持し、新しいイベントの保存時に古い日を削除します。
- Cookie・利用者IDを使わず、IP・検索語・参照元URL・個別イベント履歴は集計ファイルに保存しません。DNT/GPCを尊重します。ホスティング側のアクセスログとは別です。
- 保存先は `data/analytics.json`、`ANALYTICS_FILE` で変更可。`ANALYTICS_ENABLED=false` で記録を無効化できます。
- 単一プロセスの小規模運用向けです。集計イベントは偽装できるため厳密な監査・課金には使わないでください。毎分600件を超えるイベントは記録しません。

**Renderで継続保存する場合は永続ディスクを用意し、`ANALYTICS_FILE` をそのマウント先（例 `/var/data/analytics.json`）へ設定してください。通常の一時ファイルシステムでは再デプロイ時に消えます。** 永続ディスクはこの作業では作成していません。複数インスタンスで運用する場合は共有データベースへ移行してください。

## 公開前に残る確認

- ログイン後の公式仕様・利用条件と、読み取り専用アプリの認証方式を確認。
- ローカルで実APIの検索・詳細・ページ送りは確認済み。公開先でも同じ接続を確認。
- 公開したPagesから検索し、APIのCORS設定と通信を確認。
- CORSはブラウザの読み取り制御であり、APIの認証・利用回数制限ではありません。公開規模に応じてホスト側のアクセス制限やレート制限を設定してください。

この作業ではGitHubへのpush、ホスティングの作成・デプロイは実行していません。
