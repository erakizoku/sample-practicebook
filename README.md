# 問題集WEB

GitHub Pagesで公開できる、スマホ向けの問題演習Webアプリです。

## 使い方

1. このフォルダ一式をGitHubリポジトリに入れます。
2. GitHub Pagesで公開します。
3. config.js の menuCsvUrl と questionsCsvUrl を、GoogleスプレッドシートをCSV公開したURLに差し替えます。

## メニューCSVの列

sectionid, categoryName, questionCategoryid, questionCount, passingScore

- sectionid: メニュー自体のID。数字で入力します。
- categoryName: 画面に出すカテゴリ名
- questionCategoryid: 出題対象の問題カテゴリーID。複数指定は 1,2 のようにカンマ区切り
- questionCount: 出題数
- passingScore: 合格に必要な正解数

## 問題CSVの列

questionid, categoryId, question, answerformat, answer1, answer2, answer3, answer4, correctAnswer, explanation

- questionid: 問題ID
- categoryId: 問題カテゴリーID。メニューCSVの questionCategoryid と対応します。
- question: 問題文
- answerformat: 回答形式。single、multiple、truefalse を指定できます。
- answer1からanswer4: 選択肢。丸バツならanswer1とanswer2だけでOK
- correctAnswer: 正解番号。複数正解は 1,2 のようにカンマ区切り
- explanation: 解説

回答履歴はサーバーへ送らず、ユーザー端末のlocalStorageに保存します。
