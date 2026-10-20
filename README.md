# ホストブースト

民泊ホスト向けの無料写真診断の申し込みと、掲載順づくり・軽い補正のMVPです。

## 手動の無料診断

利用者がAirbnb掲載URL・メールアドレス・任意の相談内容を送信すると、Vercel FunctionからResend経由で担当者に通知します。担当者が掲載ページを目視で確認し、改善ポイントを3つまとめて通常3営業日以内（土日祝除く）に手作業で返信します。依頼メールの返信先は申込者です。自動スクレイピング・自動課金・自動レポート返信は行いません。

運営会社：MAORA株式会社 https://www.maora.co.jp/
差出人・担当者通知先：shumpei.hasegawa@maora.co.jp

### メール送信の有効化

1. Resendに登録した `maora.co.jp` のDNS認証を完了します。https://resend.com/domains
2. 同ドメインに限定したSending accessのAPIキーをResendで作成します。キーをチャットやGitHubに貼らず、VercelのhostboostプロジェクトのProduction環境変数 `RESEND_API_KEY` に直接保存します。
3. `DIAGNOSIS_FROM_EMAIL`、`DIAGNOSIS_TO_EMAIL`、`APP_ORIGIN` は `.env.example` の値でProductionに設定済みです。
4. Productionを再デプロイします。送信元のDNS認証とキーが揃うまでは受付を開始しないでください。

未設定のときはAPIが503を返し、サイトには「受付準備中」と表示します。送信APIが依頼メールを受け付けたときだけ完了を表示します。メールボックスへの到達はResendの配信ログでも確認してください。再送には同じ受付番号による冪等キーを使います。フォームの申込データをアプリのDBには保存せず、担当者のメールボックスとResendの配信ログで管理します。

### DNSレコード（maora.co.jp）

会社側Resendチーム「maora」で発行されたレコードです。TTLは600。ルートドメインの既存MXやSPFを置き換えず、以下の名前に追加します。個人側チームの旧レコードは使用しません。

| 種類 | 名前 | 値 | 優先度 |
| --- | --- | --- | --- |
| TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDQYaqUmvN9mjeEHvqWk7CmExQlyQ35P0ivF/uA9hmVmAqDfXc/W7RfNDtFeM5a4SKGLYlNLSQUaPG06mbg8uzGSy1QXVtWpGrfMqLPIHFo1cZv2vRzFmEY1OvolNMjmVmLjE45wLNzvrjH8bGS1vfk5OwoBwr89Sk+oLKR933epwIDAQAB | — |
| CNAME | rsend | rsend-apne1.forge.rmta.net | — |
| CNAME | send | send.forge.rmta.net | — |

## 端末内の写真ツール

index.htmlをブラウザで開いて使用します。Airbnb掲載URLを画面に入力し、写真を最大20枚追加すると見やすさの目安を表示します。部屋タイプごとのおすすめ順、手動の並べ替え、明るさ・色味の調整、JPEG保存ができます。

## MVPの範囲

- 写真の解析・補正はブラウザ内で行い、画像をサーバーへ送信・保存しません。
- 試作版はAirbnb URLから写真を自動取得しません。写真は利用者が追加します。
- スコアは明るさ・コントラスト・輪郭・寸法の簡易的な目安で、予約率を保証しません。
- アカウント、決済、診断結果の自動作成・自動送信・DB保存は未実装です。レポートは担当者がメールで返信します。


## 成果物イメージ

トップページに、架空の物件・AI生成画像を使った説明用レポートを掲載しています。実際の過去事例や予約率改善の実績としては扱いません。

無料レポートは、改善点3つ、最初の3枚の掲載順と理由、補正が役立つ写真のBefore／After例1組をメールで手動提供します。元画像が必要な場合は申込者に依頼し、撮り直しが適切な場合は理由を伝えます。複数枚の画像納品や全写真の詳しい掲載順は別途合意のうえ対応します。

画像の元データは assets/report-rooms.png、配信用は assets/report-rooms.webp。内蔵画像生成ツールで作成し、WebPは内容を変えず形式変換しています。生成条件は assets/report-image-prompt.txt に記録しています。
