const fs = require('fs');
const https = require('https');
const path = require('path');

const fontUrl = 'https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf'; // OTFを使うか、TTFを探す
// Noto Sans JPのTTFはGoogle FontsのCDNから取得するのが簡単ですが、URLが変わる可能性があります。
// ここでは、確実なURLとして、GitHubのrawデータを使いたいところですが、サイズが大きいです。

// より軽量な IPAフォントの代替として、M+ FONTSなどを探すのも手ですが、今回は「Google Fonts」のCSSからURLを抽出するのではなく、
// 直接ダウンロードできるURLを指定します。
// 実は、`pdfkit` は `.ttf` を好みます。

// 確実に動くように、シンプルなフォントダウンロードスクリプトを書きます。
// ここでは「IPAexゴシック」をダウンロードします（商用利用可能、再配布可能）。
const ipaFontUrl = 'https://moji.or.jp/wp-content/ipafont/IPAexfont/ipaexg00401.zip';

// しかしzip解凍が必要になるので面倒です。

// 修正案:
// Macに最初から入っているはずの `/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc` が読めないのは `.ttc` だからかもしれません。
// `fontkit` というライブラリを使えば `.ttc` も読めますが、`pdfkit` に依存として入っているはずです。
// ただ、コレクションの中の特定のフォントを指定する必要があるかもしれません。

// 別の手として、`node-fetch` 等で `https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP-Regular.ttf` を取得します。
// これが一番確実です。

const downloadUrl = 'https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP-Regular.ttf';
const dest = 'NotoSansJP-Regular.ttf';

const file = fs.createWriteStream(dest);
https.get(downloadUrl, function(response) {
  response.pipe(file);
  file.on('finish', function() {
    file.close(() => {
        console.log('Font downloaded successfully: ' + dest);
    });
  });
}).on('error', function(err) { // Handle errors
  fs.unlink(dest); // Delete the file async. (But we don't check the result)
  console.error('Error downloading font:', err.message);
});
