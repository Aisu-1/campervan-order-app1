const xlsx = require('xlsx');
const fs = require('fs');
const PDFDocument = require('pdfkit');

// --- デザイン設定 ---
// テーマカラー: パステルカラー
const colors = {
    primary: '#FF69B4', // HotPink
    secondary: '#FFB6C1', // LightPink
    accent: '#FFA500', // Orange
    text: '#333333',
    headerText: '#FFFFFF',
    background: '#FFF0F5' // LavenderBlush
};

// --- データ処理 ---
const workbook = xlsx.readFile('売上管理.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const rawData = xlsx.utils.sheet_to_json(worksheet);

let totalSales = 0;
let totalOrders = rawData.length;
const productSales = {};

rawData.forEach(row => {
    const amount = Number(row['合計金額']) || 0;
    totalSales += amount;
    const itemsStr = row['商品内訳'] || '';
    if (itemsStr) {
        const items = itemsStr.split(',').map(s => s.trim());
        items.forEach(item => {
            const match = item.match(/(.+) x(\d+)/);
            if (match) {
                const name = match[1];
                const quantity = parseInt(match[2], 10);
                if (!productSales[name]) productSales[name] = 0;
                productSales[name] += quantity;
            } else {
                const name = item;
                if (!productSales[name]) productSales[name] = 0;
                productSales[name] += 1;
            }
        });
    }
});
const averageSales = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;
const sortedProducts = Object.entries(productSales).sort(([, a], [, b]) => b - a);


// --- PDF作成 ---
const doc = new PDFDocument({ margin: 50 });
const outputFilename = '売上報告書_Happy.pdf';
doc.pipe(fs.createWriteStream(outputFilename));

// フォント
const fontPath = 'ipaexg.ttf'; 
if (fs.existsSync(fontPath)) {
    doc.font(fontPath);
} else {
    console.warn("Font file not found!");
}

// === デザイン描画 ===

// 背景色 (ページ全体を薄いピンクに)
doc.save()
   .rect(0, 0, doc.page.width, doc.page.height)
   .fill(colors.background);
doc.restore();

// ヘッダー (カラフルなドットやストライプ)
const headerHeight = 120;
doc.save()
   .rect(0, 0, doc.page.width, headerHeight)
   .fill(colors.primary);

// ドット模様を描画 (装飾)
for (let i = 0; i < doc.page.width; i += 30) {
    for (let j = 0; j < headerHeight; j += 30) {
        if ((i + j) % 60 === 0) {
            doc.circle(i + 15, j + 15, 5).fill('#FFFFFF', 0.3); // 半透明の白
        }
    }
}
doc.restore();

// タイトル
doc.fillColor(colors.headerText)
   .fontSize(32)
   .text('★ Happy Sales Report ★', 0, 40, { align: 'center' });

doc.fontSize(14)
   .text(`作成日: ${new Date().toLocaleDateString('ja-JP')}`, 0, 85, { align: 'center' });

doc.moveDown(4);

// サマリーボックス (3つの円または四角で表示)
const startY = 160;
const boxWidth = 150;
const gap = (doc.page.width - 100 - (boxWidth * 3)) / 2; // 中央揃え計算

function drawSummaryBox(x, y, title, value, unit, color) {
    // 影
    doc.save()
       .roundedRect(x + 5, y + 5, boxWidth, 100, 10)
       .fill('#E0E0E0');
    // 本体
    doc.restore();
    doc.save()
       .roundedRect(x, y, boxWidth, 100, 10)
       .fill('#FFFFFF')
       .stroke(color)
       .lineWidth(3);
    
    // 内容
    doc.fillColor(colors.text)
       .fontSize(12)
       .text(title, x, y + 15, { width: boxWidth, align: 'center' });
    
    doc.fillColor(color)
       .fontSize(24)
       .text(value, x, y + 40, { width: boxWidth, align: 'center' });
       
    doc.fillColor('#888888')
       .fontSize(10)
       .text(unit, x, y + 70, { width: boxWidth, align: 'center' });
       
    doc.restore();
}

drawSummaryBox(50, startY, '総売上', `¥${totalSales.toLocaleString()}`, 'Total Sales', colors.primary);
drawSummaryBox(50 + boxWidth + gap, startY, '注文数', `${totalOrders}件`, 'Orders', colors.accent);
drawSummaryBox(50 + (boxWidth + gap) * 2, startY, '平均単価', `¥${averageSales.toLocaleString()}`, 'Average', '#4169E1'); // RoyalBlue

// ランキングセクション
const rankY = 270; // 280 -> 270 に変更して上に詰める
// doc.moveDown(8); // 不要なスペース削除

// セクションタイトル
doc.save()
   .roundedRect(50, rankY, 200, 25, 12)
   .fill(colors.secondary);
doc.fillColor('#FFFFFF')
   .fontSize(14) 
   .text('人気商品ランキング ♪', 50, rankY + 6, { width: 200, align: 'center' });
doc.restore();

// --- 2列レイアウト計算 ---
const rankStartY = rankY + 40;
let currentY = rankStartY;
const colGap = 20;
const colWidth = (doc.page.width - 100 - colGap) / 2;
const rowHeight = 22; // 25 -> 22 に変更して行間を詰める

// 左右のカラムの開始X座標
const leftColX = 50;
const rightColX = 50 + colWidth + colGap;

// ヘッダー描画関数
function drawHeader(x, y) {
    doc.save()
       .rect(x, y, colWidth, 25)
       .fill(colors.accent);
    doc.fillColor('#FFFFFF')
       .fontSize(10)
       .text('順位', x + 10, y + 8)
       .text('商品名', x + 40, y + 8)
       .text('個数', x + colWidth - 40, y + 8);
    doc.restore();
}

// 左右のヘッダーを描画
drawHeader(leftColX, rankStartY);
drawHeader(rightColX, rankStartY);

currentY += 25;

if (sortedProducts.length === 0) {
    doc.text('データがありません', leftColX + 10, currentY + 10);
} else {
    // データを半分で分ける
    const midPoint = Math.ceil(sortedProducts.length / 2);

    sortedProducts.forEach(([name, count], index) => {
        // カラム判定 (左か右か)
        const isLeft = index < midPoint;
        const colX = isLeft ? leftColX : rightColX;
        
        // Y座標の計算 (右カラムに移ったら上に戻る)
        const rowIndex = isLeft ? index : (index - midPoint);
        const rowY = currentY + (rowIndex * rowHeight);

        // 縞模様
        if (rowIndex % 2 === 0) {
            doc.save()
               .rect(colX, rowY, colWidth, rowHeight)
               .fill('#FFF8DC'); 
            doc.restore();
        }

        // 順位
        let rankColor = '#666666';
        if (index === 0) rankColor = '#FFD700'; 
        else if (index === 1) rankColor = '#C0C0C0'; 
        else if (index === 2) rankColor = '#CD7F32'; 

        doc.fillColor(rankColor)
           .fontSize(12)
           .text(`${index + 1}`, colX + 10, rowY + 8);

        // 商品名 (長い場合は省略)
        doc.fillColor(colors.text)
           .fontSize(10)
           .text(name, colX + 40, rowY + 8, { width: colWidth - 80, lineBreak: false, ellipsis: true });
        
        // 個数
        doc.fillColor(colors.primary)
           .text(`${count}`, colX + colWidth - 50, rowY + 8, { align: 'right', width: 40 });

        // 下線
        doc.save()
           .moveTo(colX, rowY + rowHeight)
           .lineTo(colX + colWidth, rowY + rowHeight)
           .strokeColor('#EEEEEE')
           .stroke();
        doc.restore();
    });
}

// フッター
const footerY = doc.page.height - 60; // マージン(50)より上に配置して改ページを防ぐ
doc.fontSize(10)
   .fillColor('#888888')
   .text('Thank you for your hard work! ♡', 0, footerY, { align: 'center' });

doc.end();
console.log(`PDF created: ${outputFilename}`);