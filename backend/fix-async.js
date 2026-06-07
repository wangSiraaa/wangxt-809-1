const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/middleware/auth.js',
  'src/routes/auth.js',
  'src/routes/awards.js',
  'src/routes/inquiries.js',
  'src/routes/quotes.js',
  'src/routes/requirements.js',
  'src/routes/scores.js'
];

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  const lines = content.split('\n');
  const result = [];
  let inRouteHandler = false;
  let routeHandlerStartLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    if (line.includes('function(req, res)') && !line.includes('async')) {
      const remainingLines = lines.slice(i).join('\n');
      if (remainingLines.includes('db.prepare')) {
        line = line.replace('function(req, res)', 'async function(req, res)');
      }
    }
    
    if (line.includes('function(req, res, next)') && !line.includes('async')) {
      const remainingLines = lines.slice(i).join('\n');
      if (remainingLines.includes('db.prepare')) {
        line = line.replace('function(req, res, next)', 'async function(req, res, next)');
      }
    }
    
    if (line.includes('db.prepare') && (line.includes('.get(') || line.includes('.all(') || line.includes('.run('))) {
      if (!line.includes('await db.prepare')) {
        line = line.replace('db.prepare', 'await db.prepare');
      }
    }
    
    if (line.trim().startsWith('insertItem.run(') && !line.includes('await')) {
      line = line.replace('insertItem.run(', 'await insertItem.run(');
    }
    if (line.trim().startsWith('insertUser.run(') && !line.includes('await')) {
      line = line.replace('insertUser.run(', 'await insertUser.run(');
    }
    if (line.trim().startsWith('insertSupplier.run(') && !line.includes('await')) {
      line = line.replace('insertSupplier.run(', 'await insertSupplier.run(');
    }
    if (line.trim().startsWith('insertScore.run(') && !line.includes('await')) {
      line = line.replace('insertScore.run(', 'await insertScore.run(');
    }
    if (line.trim().startsWith('insertScoreItem.run(') && !line.includes('await')) {
      line = line.replace('insertScoreItem.run(', 'await insertScoreItem.run(');
    }
    if (line.trim().startsWith('insertInquirySupplier.run(') && !line.includes('await')) {
      line = line.replace('insertInquirySupplier.run(', 'await insertInquirySupplier.run(');
    }
    
    result.push(line);
  }
  
  const newContent = result.join('\n');
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Fixed: ${filePath}`);
  } else {
    console.log(`No changes needed: ${filePath}`);
  }
}

for (const file of filesToFix) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    fixFile(fullPath);
  } else {
    console.log(`File not found: ${fullPath}`);
  }
}

console.log('Done!');
