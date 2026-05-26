const fs = require('fs');
const content = fs.readFileSync('./src/components/AdminManager.tsx', 'utf8');

let curlies = 0;
let parens = 0;
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{') curlies++;
    if (char === '}') curlies--;
    if (char === '(') parens++;
    if (char === ')') parens--;
    
    if (curlies < 0) {
      console.log(`Curly brace closed too early at line ${i + 1}:${j + 1}. Content: ${line}`);
      process.exit(1);
    }
    if (parens < 0) {
      console.log(`Parenthesis closed too early at line ${i + 1}:${j + 1}. Content: ${line}`);
      process.exit(1);
    }
  }
}

console.log(`Done scanning! Balance counts: curlies=${curlies}, parens=${parens}`);
