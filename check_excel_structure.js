const xlsx = require('xlsx');

try {
  const workbook = xlsx.readFile('売上管理.xlsx');
  const sheetName = workbook.SheetNames[0]; // 最初のシートを読む
  const worksheet = workbook.Sheets[sheetName];
  
  // JSON形式で最初の5行を読み取る
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log('Headers:', data[0]);
  console.log('First 3 rows:', data.slice(1, 4));
} catch (error) {
  console.error('Error reading Excel file:', error);
}
