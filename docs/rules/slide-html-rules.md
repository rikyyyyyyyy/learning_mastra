# スライドHTML生成ルール

このドキュメントは、エージェントが「slide-generation」タスクで出力すべきHTMLの厳密な要件を定義します。生成時は本ドキュメントを忠実に遵守してください。

## 出力ポリシー
- 出力は純粋なHTMLのみ。
- 先頭は必ず `<!DOCTYPE html>` から開始。
- 説明文や完了メッセージ、Markdownは出力しない。

## 構造要件
- 各スライドは個別の `<div class="slide">` として定義。
- 最初のスライドのみ `class="slide active"`（表示状態）。
- それ以外は `class="slide"`（非表示）。
- 単一の縦長ページにせず、必ず複数スライド構造にする。
- iframe表示互換のため、`vh`/`vw` ではなく `%` または `rem` を優先。
- アクティブなスライドはコンテナ領域を満たす（横幅/高さともに100%基準）。

## 必須CSS（最低限）
```html
<style>
  .slide { display: none; width: 100%; height: 100%; position: relative; padding: 2rem; box-sizing: border-box; }
  .slide.active { display: block; }
</style>
```

## 例（骨組み）
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>スライドタイトル</title>
  <style>
    .slide { display: none; width: 100%; height: 100%; position: relative; padding: 2rem; box-sizing: border-box; }
    .slide.active { display: block; }
  </style>
</head>
<body>
  <div class="slide active">
    <h1>スライド1</h1>
    <p>内容...</p>
  </div>
  <div class="slide">
    <h2>スライド2</h2>
    <p>内容...</p>
  </div>
</body>
</html>
```

## ナビゲーション（必要な場合）
- スライド切り替えのためのJS/CSSを含めてもよい。
- ボタン例: 前へ/次へ。関数 `showSlide(index)` で `.active` の付け替え。
- ただし、仕様上必須ではない。最小要件は「構造要件」と「必須CSS」。

## 品質基準
- 各スライドに見出しと本文を含め、視認性を確保。
- インラインスタイルは最小限にし、可能なら `<style>` 内にまとめる。
- 外部リソースに依存しない（スタンドアロンで動作）。

