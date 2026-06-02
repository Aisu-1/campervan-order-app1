const QRCode = require('qrcode');
const path = require('path');

const url = 'https://campervan-order-app.fly.dev/';
const outputPath = path.join(__dirname, '../shop_qr.png');

QRCode.toFile(outputPath, url, {
  color: {
    dark: '#000000',  // Black dots
    light: '#FFFFFF' // White background
  },
  width: 500 // Size of the image
}, function (err) {
  if (err) throw err;
  console.log('QR code saved to ' + outputPath);
});
