import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(process.argv.slice(2).find(argument => !argument.startsWith('--')) || '.');
const history = process.argv.includes('--history');
const gitExecutable = process.env.GIT_EXE || 'git';
const findings = [];
const textFile = name => /\.(?:js|jsx|mjs|json|ya?ml|md|txt|sh|sql|toml|pem)$|(?:^|\/)\.env(?:\..*)?$|Dockerfile$/i.test(name);
function check(name, content, revision = 'working-tree') {
  if (/^(tests\/|tests\\)/.test(name)) return; // explicit fake keys used by cryptographic tests
  const patterns = [
    ['API key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/g],
    ['credential', /(?:MAX_BOT_TOKEN|LLM_API_KEY|OPENAI_API_KEY|MAX_WEBHOOK_SECRET|PRIVATE_DATA_ENCRYPTION_KEY)\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})/g],
    ['database password', /postgres(?:ql)?:\/\/[^\s:@]+:([^@\s]{6,})@/g],
  ];
  for (const [kind, regex] of patterns) for (const match of content.matchAll(regex)) {
    const value = match[1] || match[0];
    if (/replace|placeholder|example|local-(?:app|admin)-password|process|env|test[-_]|your[-_]|change[-_]|\$\{/i.test(value)) continue;
    findings.push({file:name,revision,kind});
  }
}
if (history) {
  const objects = execFileSync(gitExecutable, ['rev-list','--objects','--all'], {cwd:root,encoding:'utf8'}).trim().split('\n')
    .map(line => [line.slice(0,40),line.slice(41)]).filter(([,name])=>name && textFile(name));
  const batch = execFileSync(gitExecutable, ['cat-file','--batch'], {cwd:root,input:objects.map(([id])=>id).join('\n')+'\n',maxBuffer:100*1024*1024});
  let offset = 0;
  for (const [id,name] of objects) {
    const end = batch.indexOf(10,offset);
    const [hash,type,size] = batch.subarray(offset,end).toString().split(' ');
    offset = end + 1;
    if (type === 'blob') check(name,batch.subarray(offset,offset+Number(size)).toString(),hash || id);
    offset += Number(size || 0) + 1;
  }
} else {
  function walk(dir) {
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      if (['.git','node_modules','dist','var','secrets','test-results'].includes(entry.name)) continue;
      const full = path.join(dir,entry.name), name = path.relative(root,full).replaceAll('\\','/');
      if (entry.isDirectory()) walk(full);
      else if (textFile(name)) check(name,fs.readFileSync(full,'utf8'));
    }
  }
  walk(root);
}
console.log(JSON.stringify({scope:history?'all Git objects':'publishable source',findings},null,2));
if (findings.length) process.exitCode = 1;
