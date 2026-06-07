const fs = require('fs');
const path = require('path');

const root = '/Users/mingyuan/workspace/sihuo/wangxtw3/809';

function writeFile(relativePath, content) {
  const fullPath = path.join(root, relativePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content);
  console.log('Created:', relativePath);
}

writeFile('backend/tsconfig.json', `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`);

console.log('Starting file generation...');
