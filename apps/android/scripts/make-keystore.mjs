#!/usr/bin/env node
// 안드로이드 앱 서명 키(keystore) 만들기 — 내 PC 에서 딱 한 번만 실행
//
//   cd apps/android
//   npm install            (처음 한 번)
//   npm run keystore       (= node scripts/make-keystore.mjs)
//
// 만들어지는 것 (apps/android/keystore/ 폴더, .gitignore 로 커밋 제외됨)
//   - sfaclan-release.p12   : 서명 키 파일 (PKCS12, RSA 2048, SHA-256, CN=SFAClan, 30년, 별칭 sfaclan)
//   - github-secrets.txt    : GitHub Secrets 에 넣을 4개 값 (키 파일 base64·비밀번호·별칭)
//
// 옵션
//   --password <비밀번호>   비밀번호를 직접 정함 (없으면 안전한 무작위 비밀번호. 환경 변수 SFACLAN_KEYSTORE_PASSWORD 도 가능)
//   --force                 이미 있는 키 파일을 덮어씀 (주의: 예전 키로 서명한 앱은 더 이상 업데이트할 수 없게 됨)
//
// ※ 이 키를 잃어버리면 이미 설치된 앱을 같은 앱으로 업데이트할 수 없다 (지우고 새로 설치해야 함). 반드시 백업할 것.
import { createHash, generateKeyPairSync, randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // apps/android
const OUT_DIR = join(APP_DIR, 'keystore');
const KEYSTORE_PATH = join(OUT_DIR, 'sfaclan-release.p12');
const SECRETS_PATH = join(OUT_DIR, 'github-secrets.txt');

const KEY_ALIAS = 'sfaclan';
const SUBJECT_CN = 'SFAClan';
const VALID_YEARS = 30;

const fail = (message) => {
  console.error(`\n[오류] ${message}\n`);
  process.exit(1);
};

// ---------------------------------------------------------------------
// 옵션 읽기
// ---------------------------------------------------------------------
const args = process.argv.slice(2);
const force = args.includes('--force');
const passwordArgIndex = args.indexOf('--password');
let password = passwordArgIndex >= 0 ? args[passwordArgIndex + 1] : process.env.SFACLAN_KEYSTORE_PASSWORD;

if (passwordArgIndex >= 0 && (!password || password.startsWith('--'))) {
  fail('--password 뒤에 비밀번호를 적어 주세요.');
}

// 무작위 비밀번호: 영문 대소문자+숫자 28자 (특수문자를 빼서 셸·GitHub Secrets 에 붙여 넣을 때 문제가 없게)
const makePassword = (length = 28) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += chars[randomInt(chars.length)];
  return out;
};

if (!password) {
  password = makePassword();
} else if (password.length < 8) {
  fail('비밀번호는 8자 이상이어야 합니다.');
}

if (existsSync(KEYSTORE_PATH) && !force) {
  fail(
    `이미 서명 키가 있습니다: ${relative(process.cwd(), KEYSTORE_PATH)}\n` +
      '        같은 키로 계속 서명해야 앱 업데이트가 됩니다. 새로 만들 필요가 없으면 그대로 쓰세요.\n' +
      '        정말 새 키로 바꾸려면 --force 를 붙여 다시 실행하세요. (기존 앱은 지우고 새로 설치해야 함)',
  );
}

// ---------------------------------------------------------------------
// 키·인증서 만들기
// ---------------------------------------------------------------------
console.log('서명 키를 만드는 중... (RSA 2048)');

// RSA 키는 Node 내장 crypto 로 만들고(빠르고 안전한 난수), 인증서·PKCS12 포장은 node-forge 로 함
const { privateKey: privatePem } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 0x10001,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const privateKey = forge.pki.privateKeyFromPem(privatePem);
const publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e);

const cert = forge.pki.createCertificate();
cert.publicKey = publicKey;
// 일련번호: 양수가 되도록 첫 바이트의 최상위 비트를 끔
const serial = randomBytes(16);
serial[0] &= 0x7f;
cert.serialNumber = serial.toString('hex');

const notBefore = new Date();
notBefore.setMinutes(notBefore.getMinutes() - 5); // 기기 시계가 조금 느려도 문제없게
const notAfter = new Date(notBefore);
notAfter.setFullYear(notAfter.getFullYear() + VALID_YEARS);
cert.validity.notBefore = notBefore;
cert.validity.notAfter = notAfter;

const subject = [{ name: 'commonName', value: SUBJECT_CN }];
cert.setSubject(subject);
cert.setIssuer(subject); // 자체 서명
cert.setExtensions([{ name: 'subjectKeyIdentifier' }]);
cert.sign(privateKey, forge.md.sha256.create());

// PKCS12 (Java keytool·apksigner 가 읽을 수 있는 형식). 키 비밀번호 = 저장소 비밀번호
const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert], password, {
  algorithm: '3des',
  friendlyName: KEY_ALIAS,
  generateLocalKeyId: true,
});
const p12Buffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

// 확인: 방금 만든 파일을 다시 열어 키·인증서가 들어 있는지
{
  const parsed = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12Buffer.toString('binary')), password);
  const keyBags = parsed.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const certBags = parsed.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const aliasOk = keyBags.length === 1 && (keyBags[0].attributes?.friendlyName ?? [])[0] === KEY_ALIAS;
  if (!aliasOk || certBags.length !== 1) fail('만든 키 파일을 다시 읽는 데 실패했습니다.');
}

const certDer = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary');
const fingerprint = (algorithm) =>
  createHash(algorithm)
    .update(certDer)
    .digest('hex')
    .toUpperCase()
    .match(/.{2}/g)
    .join(':');

// ---------------------------------------------------------------------
// 파일 쓰기 (본인만 읽을 수 있게)
// ---------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(KEYSTORE_PATH, p12Buffer, { mode: 0o600 });

const secretsText = [
  '# GitHub 저장소 → Settings → Secrets and variables → Actions → [New repository secret]',
  '# 아래 4개를 "이름" / "값" 그대로 하나씩 등록하세요. (값은 앞뒤 공백·줄바꿈 없이 한 줄 전체를 복사)',
  '# 등록이 끝나면 이 파일은 지우세요. (키 파일 sfaclan-release.p12 와 비밀번호는 따로 안전하게 백업)',
  '',
  'ANDROID_KEYSTORE_BASE64',
  p12Buffer.toString('base64'),
  '',
  'ANDROID_KEYSTORE_PASSWORD',
  password,
  '',
  'ANDROID_KEY_ALIAS',
  KEY_ALIAS,
  '',
  'ANDROID_KEY_PASSWORD',
  password,
  '',
  '# (참고) 인증서 지문 — Firebase 등에서 SHA 지문을 물어볼 때 사용',
  `# SHA-1:   ${fingerprint('sha1')}`,
  `# SHA-256: ${fingerprint('sha256')}`,
  '',
].join('\n');
writeFileSync(SECRETS_PATH, secretsText, { mode: 0o600 });

const show = (path) => relative(process.cwd(), path) || path;
console.log(`
완료!
  서명 키 파일 : ${show(KEYSTORE_PATH)}
  시크릿 값    : ${show(SECRETS_PATH)}
  별칭         : ${KEY_ALIAS}
  유효 기간    : ${VALID_YEARS}년 (~ ${notAfter.toISOString().slice(0, 10)})
  SHA-256 지문 : ${fingerprint('sha256')}

꼭 해야 할 일
  1) [백업] 키 파일(sfaclan-release.p12)과 비밀번호(github-secrets.txt 안에 있음)를
     USB·비밀번호 관리자 등 두 곳 이상에 보관하세요.
     ※ 잃어버리면 이미 설치된 앱을 업데이트할 수 없습니다. (앱을 지우고 새로 설치해야 함)
  2) [등록] GitHub 저장소 → Settings → Secrets and variables → Actions → [New repository secret] 에서
     github-secrets.txt 의 4개 값(ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD,
     ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD)을 등록하세요.
  3) [삭제] 등록이 끝나면 github-secrets.txt 를 지우세요.
     keystore 폴더는 커밋되지 않게 막혀 있지만, git add -f 로 억지로 넣지 마세요. (공개 저장소)
`);
