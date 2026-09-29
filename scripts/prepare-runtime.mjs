// Package only server dependencies selected by the committed lockfile.
import fs from 'node:fs';
import path from 'node:path';
const out='/release';
fs.mkdirSync(path.join(out,'scripts'),{recursive:true});
for(const name of ['dist','server','shared','schemas','config','data','package.json','package-lock.json','russiantrustedca.pem'])
  fs.cpSync(name,path.join(out,name),{recursive:true});
for(const name of ['lib','setup-bot.js','setup-webhook.js'])
  fs.cpSync(path.join('scripts',name),path.join(out,'scripts',name),{recursive:true});
const {packages}=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
for(const [name,entry] of Object.entries(packages)) {
  if(!name.startsWith('node_modules/') || entry.dev || entry.devOptional || !fs.existsSync(name))continue;
  fs.mkdirSync(path.dirname(path.join(out,name)),{recursive:true});
  fs.cpSync(name,path.join(out,name),{recursive:true});
}
