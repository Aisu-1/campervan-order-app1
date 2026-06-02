const fs = require('fs');
const https = require('https');
const unzipper = require('unzipper');

const fontUrl = 'https://moji.or.jp/wp-content/ipafont/IPAexfont/ipaexg00401.zip';
const dest = 'ipaexg00401.zip';

const file = fs.createWriteStream(dest);

https.get(fontUrl, function(response) {
  response.pipe(file);
  file.on('finish', function() {
    file.close(() => {
        console.log('Font ZIP downloaded: ' + dest);
        
        // Extract the TTF file
        fs.createReadStream(dest)
        .pipe(unzipper.Parse())
        .on('entry', function (entry) {
            const fileName = entry.path;
            if (fileName.endsWith('.ttf')) {
                const parts = fileName.split('/');
                const outPath = parts[parts.length - 1]; // Extract just the file name
                console.log(`Extracting ${outPath}...`);
                entry.pipe(fs.createWriteStream(outPath));
            } else {
                entry.autodrain();
            }
        });
    });
  });
}).on('error', function(err) { 
  fs.unlink(dest);
  console.error('Error downloading font:', err.message);
});
