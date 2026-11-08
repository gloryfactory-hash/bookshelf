// 임지형 작가 도트 캐릭터 (2026-11-08, 시안/track_v1 나를 src에 옮김). build.js가 runner가 켜진 서가에 SVG 세 장을 만든다.
// 사진(data/media/limjihyung/marathon.jpg)의 특징을 픽셀로 옮겼다:
// 검은 캡모자, 선글라스, 붉은 갈색 묶은 머리, 회녹색 민소매 + 흰 배번, 검은 반바지, 흰 운동화(분홍 끈).
// AI 그림이 아니라 한 칸씩 찍은 것. 14×16칸, 오른쪽을 본다. 화면에서는 2배(28×32px)로 그린다.
export const PAL = {
  K: '#1E2421', // 모자·안옷·반바지
  H: '#8E4A2C', // 머리
  S: '#E9B48E', // 피부
  G: '#2C3740', // 선글라스
  L: '#A9C2CF', // 선글라스 빛
  T: '#7F9A86', // 회녹색 민소매
  D: '#5F7966', // 민소매 그늘
  W: '#F7F8F6', // 배번·운동화
  R: '#E06C8C', // 운동화 끈
  M: '#B5524A', // 웃는 입
};
const HEAD = [
  '....KKKKK.....',
  '...KKKKKKK....',
  '...KKKKKKKKKK.',
  '..HHSSGGGLG...',
  '.HHHSSSSSSS...',
  'HHH.SSSSMS....',
  'H....SSSS.....',
];
const body = (arms, legs) => [...HEAD, ...arms, 'KKKKKK'.padStart(10, '.').padEnd(14, '.'), '....KKKKKK....', ...legs];
// 달리기 4장: 1 앞뒤로 벌림 → 2 지나감(뒷다리 굽힘) → 3 벌림(팔 반대) → 4 지나감(앞무릎 들기)
export const FRAMES = {
  run1: body(['....TTTTTS....', '...STDWWTTS...', '..S.TTWWTT.S..', '....TDTTTT....'], ['...SS....SS...', '..SS......SS..', '.WR........WR.']),
  run2: body(['....TTTTTT....', '....STWWTS....', '....STWWTS....', '....TDTTTT....'], ['...SS.SS......', '..WR..SS......', '......WWR.....']),
  run3: body(['....STTTTT....', '...STDWWTTS...', '..S.TTWWTTS...', '....TDTTTT....'], ['...SS....SS...', '..SS......SS..', '.WR........WR.']),
  run4: body(['....TTTTTT....', '....STWWTS....', '....STWWTS....', '....TDTTTT....'], ['......SS.SS...', '......SS.WR...', '.....WWR......']),
  stand: body(['....TTTTTT....', '...STDWWTTS...', '...STTWWTTS...', '....TDTTTT....'], ['.....SS.SS....', '.....SS.SS....', '....WWR.WWR...']),
  // 손 흔들기 2장 (사진의 자세). 오른손을 머리 옆으로 들고 좌우로
  wave1: (() => { const f = body(['....TTTTTTS...', '...STDWWTT.S..', '...STTWWTT....', '....TDTTTT....'], ['.....SS.SS....', '.....SS.SS....', '....WWR.WWR...']); f[4] = f[4].slice(0, 11) + 'S..'; f[5] = f[5].slice(0, 11) + 'SS.'; f[6] = f[6].slice(0, 11) + 'S..'; return f; })(),
  wave2: (() => { const f = body(['....TTTTTTS...', '...STDWWTT.S..', '...STTWWTT....', '....TDTTTT....'], ['.....SS.SS....', '.....SS.SS....', '....WWR.WWR...']); f[3] = f[3].slice(0, 12) + 'SS'; f[4] = f[4].slice(0, 12) + 'S.'; f[5] = f[5].slice(0, 11) + 'S..'; f[6] = f[6].slice(0, 11) + 'S..'; return f; })(),
};
// 서 있을 때 동작 (2026-11-08 사용자 "가만히 서 있으면 스트레칭하고, 가끔 화면 보고 하트 날리고")
const put = (f, pts, c) => { for (const [y, x] of pts) f[y] = f[y].slice(0, x) + c + f[y].slice(x + 1); return f; };
const STAND_LEGS = ['.....SS.SS....', '.....SS.SS....', '....WWR.WWR...'];
// 스트레칭 가: 두 팔을 머리 위로 쭉 (만세). 1장은 반쯤, 2장은 끝까지
FRAMES.strA1 = put(body(['...STTTTTS....', '....TDWWTT....', '....TTWWTT....', '....TDTTTT....'], STAND_LEGS), [[6, 3], [5, 2], [4, 2], [6, 10], [5, 11], [4, 12]], 'S');
FRAMES.strA2 = put(body(['...STTTTTTS...', '....TDWWTT....', '....TTWWTT....', '....TDTTTT....'], STAND_LEGS), [[6, 3], [5, 2], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [6, 10], [5, 11], [4, 11], [3, 12], [2, 13], [1, 13], [0, 13]], 'S');
// 스트레칭 나: 한 다리로 서서 뒷발을 손으로 잡아당기기 (러너 허벅지 스트레칭)
FRAMES.strB = (() => { const f = body(['....TTTTTT....', '...STDWWTTS...', '..S.TTWWTT.S..', '..S.TDTTTT....'], ['...SS.SS......', '......SS......', '.....WWR......']);
  f[11] = '.WR.KKKKKK....'; f[12] = '..SSKKKKKK....'; return f; })();
// 앞모습: 화면을 보고 서기 / 손을 내밀며 하트 날리기 (입을 오므림)
const FRONT_HEAD = [
  '....KKKKKK....',
  '...KKKKKKKK...',
  '..KKKKKKKKKK..',
  '..HSSSSSSSSH..',
  '..HGGGSSGGLH..',
  '..HSSSMMSSSH..',
  '...HSSSSSSH...',
];
const FRONT_BODY = ['....TTTTTT....', '...STDWWTTS...', '...STTWWTTS...', '....TDTTTT....', '....KKKKKK....', '....KKKKKK....', '....SS..SS....', '....SS..SS....', '...WWR..RWW...'];
FRAMES.front = [...FRONT_HEAD, ...FRONT_BODY];
FRAMES.kiss = (() => { const f = [...FRONT_HEAD, ...FRONT_BODY]; f[5] = '..HSSSSMSSSH..'; // 입을 오므림
  return put(put(f, [[8, 10]], 'T'), [[7, 10], [6, 11], [5, 12], [5, 13]], 'S'); })();
export const ORDER = ['run1', 'run2', 'run3', 'run4', 'stand', 'wave1', 'wave2', 'strA1', 'strA2', 'strB', 'front', 'kiss'];
// 하트 (5×5, 분홍 + 흰 빛)
export const HEART = ['.P.P.', 'PWPPP', 'PPPPP', '.PPP.', '..P..'];
export const HP = { P: '#E8607E', W: '#FFFFFF' };
export function heartSvg() {
  let r = ''; HEART.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${HP[c]}"/>`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" width="5" height="5" shape-rendering="crispEdges">${r}</svg>`;
}
export const FW = 14, FH = 16;
export function sheetSvg() {
  let r = '';
  ORDER.forEach((name, i) => {
    const f = FRAMES[name];
    if (f.length !== FH) throw new Error(`${name}: ${f.length}줄`);
    f.forEach((row, y) => {
      if (row.length !== FW) throw new Error(`${name} ${y}줄: ${row.length}칸 "${row}"`);
      [...row].forEach((c, x) => { if (c !== '.') { if (!PAL[c]) throw new Error('색 없음 ' + c); r += `<rect x="${i * FW + x}" y="${y}" width="1" height="1" fill="${PAL[c]}"/>`; } });
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FW * ORDER.length} ${FH}" width="${FW * ORDER.length}" height="${FH}" shape-rendering="crispEdges">${r}</svg>`;
}

// 땀방울 (2026-11-08 사용자 "뛰어갈 때 땀방울이 나오게"). 만화처럼 머리 뒤로 튀어 날아간다.
// 10×8칸, 오른쪽 끝이 머리 쪽. 4장이 달리기 한 바퀴(0.44초)와 같이 돈다. 달릴 때만 보인다.
export const SW = { b: '#7FC4EA', d: '#4E9CC9', w: '#FFFFFF' };
export const SWEAT = [
  ['..........', '..........', '..........', '.......b..', '......bwbd', '......bbbd', '.......dd.', '..........'],
  ['..........', '....b.....', '...bwb....', '...bbb....', '....d....b', '........bb', '..........', '..........'],
  ['..........', '.b........', '.bb.......', '..........', '.....b....', '....bwb...', '....bbb...', '.....d....'],
  ['..........', '..........', '..........', '..........', '..........', '.b........', '.bb.......', '..........'],
];
export const SWW = 10, SWH = 8;
export function sweatSvg() {
  let r = '';
  SWEAT.forEach((f, i) => {
    if (f.length !== SWH) throw new Error(`땀 ${i}: ${f.length}줄`);
    f.forEach((row, y) => {
      if (row.length !== SWW) throw new Error(`땀 ${i} ${y}줄: ${row.length}칸`);
      [...row].forEach((c, x) => { if (c !== '.') r += `<rect x="${i * SWW + x}" y="${y}" width="1" height="1" fill="${SW[c]}"/>`; });
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SWW * SWEAT.length} ${SWH}" width="${SWW * SWEAT.length}" height="${SWH}" shape-rendering="crispEdges">${r}</svg>`;
}
